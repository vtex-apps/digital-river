import { AuthenticationError, ResolverError, UserInputError } from '@vtex/api'
import { json } from 'co-body'
import convertIso3To2 from 'country-iso-3-to-2'

import { applicationId } from '../constants'

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
    clients: { apps, digitalRiver, orderForm },
    req,
    req: { headers },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  if (!settings.vtexAppKey || !settings.vtexAppToken) {
    throw new AuthenticationError('Missing VTEX app key and token')
  }

  const createCheckoutRequest = (await json(req)) as CreateCheckoutRequest

  const [browserIp] = (headers['x-forwarded-for'] as string)?.split(',')

  if (!createCheckoutRequest?.orderFormId) {
    throw new UserInputError('No orderForm ID provided')
  }

  logger.info({
    message: 'DigitalRiverCreateCheckout-requestReceived',
    orderFormId: createCheckoutRequest.orderFormId,
  })

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

  const { locale = 'en_US' } = orderFormData?.clientPreferencesData

  const items = []
  // const docks = []

  // for (const logisticsInfo of orderFormData.shippingData.logisticsInfo) {
  //   const { selectedSla, slas } = logisticsInfo
  //   const [{ dockId }] = slas.find(
  //     ({ name }: { name: string }) => name === selectedSla
  //   ).deliveryIds

  //   // eslint-disable-next-line no-await-in-loop
  //   let dockInfo = await logistics.getDocksById(dockId)

  //   if (
  //     !dockInfo?.address?.city ||
  //     !dockInfo?.address?.postalCode ||
  //     !dockInfo?.address?.country?.acronym
  //   ) {
  //     logger.warn({
  //       message: 'DigitalRiverCreateCheckout-dockAddressMisconfiguration',
  //       dockInfo,
  //     })
  //     dockInfo = ''
  //   }

  //   docks.push(dockInfo)
  // }

  // for (const [index, item] of orderFormData.items.entries()) {
  for (const item of orderFormData.items) {
    let discountPrice = 0
    let discountPercent = 0

    for (const priceTag of item.priceTags) {
      if (priceTag.name.toUpperCase().includes('DISCOUNT@')) {
        if (!priceTag.name.toUpperCase().includes('DISCOUNT@SHIPPING')) {
          if (priceTag.isPercentual) {
            discountPercent = Math.abs(priceTag.value)
          } else {
            discountPrice += Math.abs(priceTag.value as number)
          }
        }
      }
    }

    // const dock = docks[index]

    const newItem: CheckoutItem = {
      skuId: item.id,
      quantity: item.quantity,
      price: item.price / 100,
      discount: discountPercent
        ? {
            percentOff: discountPercent,
            quantity: item.quantity,
          }
        : discountPrice
        ? {
            amountOff: discountPrice / 100 / item.quantity,
            quantity: item.quantity,
          }
        : undefined,
      // ...(!!dock && {
      //   shipFrom: {
      //     address: {
      //       line1: dock.address.street || 'Unknown',
      //       line2: dock.address.complement || '',
      //       city: dock.address.city,
      //       postalCode: dock.address.postalCode,
      //       state: dock.address.state || '',
      //       country: convertIso3To2(dock.address.country.acronym),
      //     },
      //   },
      // }),
    }

    items.push(newItem)
  }

  const shippingTotal = orderFormData.totalizers.find(
    ({ id }: { id: string }) => id === 'Shipping'
  )?.value

  const checkoutPayload: DRCheckoutPayload = {
    applicationId,
    currency: orderFormData?.storePreferencesData?.currencyCode ?? 'USD',
    taxInclusive: true,
    email: orderFormData.clientProfileData?.email ?? '',
    locale: locale.replace('-', '_'),
    browserIp,
    shipFrom: {
      address: {
        line1: orderFormData.shippingData?.address?.street || 'Unknown',
        line2: orderFormData.shippingData?.address?.complement || '',
        city: orderFormData.shippingData?.address?.city || 'Unknown',
        state: orderFormData.shippingData?.address?.state || '',
        postalCode: orderFormData.shippingData?.address?.postalCode || '',
        country: shippingCountry,
      },
    },
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
  }

  logger.info({
    message: 'DigitalRiverCreateCheckout-createCheckoutRequest',
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
      message: 'DigitalRiverCreateCheckout-createCheckoutFailure',
    })

    throw new ResolverError({
      message: 'Checkout creation failed',
      error: err,
    })
  }

  logger.info({
    message: 'DigitalRiverCreateCheckout-createCheckoutResponse',
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

  logger.info({
    message: 'DigitalRiverUpdateCheckout-requestReceived',
    checkoutId,
    sourceId,
  })

  let updateCheckoutResponse = null

  logger.info({
    message: 'DigitalRiverUpdateCheckout-updateCheckoutRequest',
    payload: {
      checkoutId,
      sourceId,
    },
  })

  try {
    updateCheckoutResponse = await digitalRiver.updateCheckoutWithSource({
      settings,
      checkoutId,
      sourceId,
    })
  } catch (err) {
    logger.error({
      error: err,
      message: 'DigitalRiverUpdateCheckout-updateCheckoutFailure',
    })

    throw new ResolverError({
      message: 'Update Checkout failure',
      error: err,
    })
  }

  logger.info({
    message: 'DigitalRiverUpdateCheckout-updateCheckoutResponse',
    data: updateCheckoutResponse,
  })

  ctx.body = { updateCheckoutResponse }

  await next()
}

export async function countryCode(ctx: Context, next: () => Promise<unknown>) {
  const { country } = ctx.vtex.route.params

  if (!country || country.length !== 3) {
    throw new UserInputError('3 digit country code must be provided')
  }

  const code = convertIso3To2((country as string).toUpperCase())

  ctx.status = 200
  ctx.body = { code }
  await next()
}
