import { AuthenticationError, ResolverError, UserInputError } from '@vtex/api'
import { json } from 'co-body'
import convertIso3To2 from 'country-iso-3-to-2'

import { applicationId, COUNTRIES_LANGUAGES } from '../constants'

interface CreateCheckoutRequest {
  orderFormId: string
}
interface UpdateCheckoutRequest {
  checkoutId: string
  sourceId: string
  readyForStorage?: boolean
}

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

export async function digitalRiverCreateCheckout(
  ctx: Context,
  next: () => Promise<unknown>
) {
  const {
    clients: { apps, digitalRiver, logistics, orderForm },
    req,
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  if (!settings.vtexAppKey || !settings.vtexAppToken) {
    throw new AuthenticationError('Missing VTEX app key and token')
  }

  const createCheckoutRequest = (await json(req)) as CreateCheckoutRequest

  if (!createCheckoutRequest?.orderFormId) {
    throw new UserInputError('No orderForm ID provided')
  }

  const orderFormData = await orderForm.getOrderForm(
    createCheckoutRequest.orderFormId,
    settings.vtexAppKey,
    settings.vtexAppToken
  )

  logger.info({
    message: 'DigitalRiverCreateCheckout-orderFormData',
    orderFormData,
  })

  if (!orderFormData) {
    throw new ResolverError('orderForm not found')
  }

  const shippingCountry = orderFormData?.shippingData?.address?.country
    ? convertIso3To2(orderFormData?.shippingData?.address?.country)
    : ''

  let locale = 'en_US'

  if (shippingCountry && shippingCountry in COUNTRIES_LANGUAGES) {
    locale = COUNTRIES_LANGUAGES[shippingCountry]
  }

  const items = []
  const docks = []

  for (const logisticsInfo of orderFormData.shippingData.logisticsInfo) {
    const { selectedSla, slas } = logisticsInfo
    const [{ dockId }] = slas.find(
      ({ name }: { name: string }) => name === selectedSla
    ).deliveryIds

    // eslint-disable-next-line no-await-in-loop
    const dockInfo = await logistics.getDocksById(dockId)

    if (
      !dockInfo.address?.street ||
      !dockInfo.address?.city ||
      !dockInfo.address?.state ||
      !dockInfo.address?.postalCode ||
      !dockInfo.address?.country?.acronym
    ) {
      logger.error({
        message: 'DigitalRiverTaxCalculation-DockAddressMisconfiguration',
        dockInfo,
      })
      throw new Error('dock-address-misconfiguration')
    }

    docks.push(dockInfo)
  }

  for (const [index, item] of orderFormData.items.entries()) {
    let discountPrice = 0

    for (const priceTag of item.priceTags) {
      if (priceTag.name.toUpperCase().includes('DISCOUNT@')) {
        if (priceTag.isPercentual) {
          discountPrice += Math.abs(priceTag.value * item.price)
        } else {
          discountPrice += Math.abs(priceTag.value as number)
        }
      }
    }

    const dock = docks[index]

    const newItem: CheckoutItem = {
      skuId: item.id,
      quantity: item.quantity,
      price: item.price / 100,
      discount: discountPrice
        ? {
            amountOff: discountPrice / 100 / item.quantity,
            quantity: item.quantity,
          }
        : undefined,
      shipFrom: {
        address: {
          line1: dock.address.street,
          line2: dock.address.complement || '',
          city: dock.address.city,
          postalCode: dock.address.postalCode,
          state: dock.address.state,
          country: convertIso3To2(dock.address.country.acronym),
        },
      },
    }

    items.push(newItem)
  }

  // Digital River only supports a single shipFrom address per checkout,
  // so we'll use the address of the first dock
  // const [{ selectedSla }] = orderFormData.shippingData.logisticsInfo

  // const slaInfo = orderFormData.shippingData.logisticsInfo[0].slas as any[]

  // const [{ dockId }] = slaInfo.find(
  //   ({ name }: { name: string }) => name === selectedSla
  // ).deliveryIds

  // const dockInfo = await logistics.getDocksById(dockId)

  // if (
  //   !dockInfo.address?.street ||
  //   !dockInfo.address?.city ||
  //   !dockInfo.address?.state ||
  //   !dockInfo.address?.postalCode ||
  //   !dockInfo.address?.country?.acronym
  // ) {
  //   logger.error({
  //     message: 'DigitalRiverTaxCalculation-DockAddressMisconfiguration',
  //     dockInfo,
  //   })
  //   throw new Error('dock-address-misconfiguration')
  // }

  const shippingTotal = orderFormData.totalizers.find(
    ({ id }: { id: string }) => id === 'Shipping'
  )?.value

  const checkoutPayload: DRCheckoutPayload = {
    applicationId,
    currency: orderFormData?.storePreferencesData?.currencyCode ?? 'USD',
    taxInclusive: true,
    email: orderFormData.clientProfileData?.email ?? '',
    // shipFrom: {
    //   address: {
    //     line1: dockInfo.address.street,
    //     line2: dockInfo.address.complement || '',
    //     city: dockInfo.address.city,
    //     postalCode: dockInfo.address.postalCode,
    //     state: dockInfo.address.state,
    //     country: convertIso3To2(dockInfo.address.country.acronym),
    //   },
    // },
    shipTo: {
      name:
        orderFormData.clientProfileData?.firstName &&
        orderFormData.clientProfileData?.lastName
          ? `${orderFormData.clientProfileData?.firstName} ${orderFormData.clientProfileData?.lastName}`
          : '',
      phone: orderFormData.clientProfileData?.phone || '',
      address: {
        line1: orderFormData.shippingData?.address?.street || 'Unknown',
        line2: orderFormData.shippingData?.address?.complement || '',
        city: orderFormData.shippingData?.address?.city || 'Unknown',
        state: orderFormData.shippingData?.address?.state || '',
        postalCode: orderFormData.shippingData?.address?.postalCode || '',
        country: shippingCountry,
      },
    },
    items,
    shippingChoice: {
      amount: shippingTotal ? shippingTotal / 100 : 0,
      description: '',
      serviceLevel: '',
    },
    locale,
  }

  logger.info({
    message: 'DigitalRiverCreateCheckout-CreateCheckoutRequest',
    checkoutPayload,
  })

  let checkoutResponse = null

  try {
    checkoutResponse = await digitalRiver.createCheckout({
      settings,
      checkoutPayload,
    })
  } catch (err) {
    logger.error({
      error: err,
      orderFormId: createCheckoutRequest.orderFormId,
      message: 'DigitalRiverCreateCheckout-CreateCheckoutFailure',
    })

    throw new ResolverError({
      message: 'Checkout creation failed',
      error: err,
    })
  }

  logger.info({
    message: 'DigitalRiverCreateCheckout-CreateCheckoutResponse',
    checkoutResponse,
  })

  ctx.body = {
    checkoutId: checkoutResponse.id,
    paymentSessionId: checkoutResponse.paymentSessionId,
  }

  await next()
}

export async function digitalRiverUpdateCheckout(
  ctx: Context,
  next: () => Promise<unknown>
) {
  const {
    clients: { apps, digitalRiver },
    req,
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  const updateCheckoutRequest = (await json(req)) as UpdateCheckoutRequest

  if (!updateCheckoutRequest?.checkoutId || !updateCheckoutRequest?.sourceId) {
    throw new UserInputError({
      message: 'Checkout ID and Source ID must be provided',
    })
  }

  const { checkoutId, sourceId } = updateCheckoutRequest

  let updateCheckoutResponse = null

  try {
    updateCheckoutResponse = await digitalRiver.updateCheckoutWithSource({
      settings,
      checkoutId,
      sourceId,
    })
  } catch (err) {
    logger.error({
      error: err,
      message: 'DigitalRiver-UpdateCheckoutFailure',
    })

    throw new ResolverError({
      message: 'Update Checkout failure',
      error: err,
    })
  }

  ctx.body = { updateCheckoutResponse }

  await next()
}
