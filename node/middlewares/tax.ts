import { ResolverError, UserInputError, AuthenticationError } from '@vtex/api'
import { json } from 'co-body'
import convertIso3To2 from 'country-iso-3-to-2'

import { applicationId, COUNTRIES_LANGUAGES } from '../constants'

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

// NOTE! This tax integration is not yet fully functional.
// TODO: Figure out a good way to send the checkoutId and paymentSessionId to the front end
// Initially the intent was to save these values to the orderForm, but this causes an endless loop
// because updating the orderForm causes a new tax calculation request to be sent.
// Maybe the values can be returned in the tax hub response? `jurisCode` field is a possibility
// Or maybe we need to save the values to vbase?

// TODO: Move shipFrom address to each item in case items are coming from different docks
// See checkout.ts where this was already done

export async function digitalRiverOrderTaxHandler(
  ctx: Context,
  next: () => Promise<unknown>
) {
  const {
    clients: { apps, digitalRiver, logistics, orderForm },
    req,
    req: {
      headers: { authorization },
    },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  if (!authorization || authorization !== settings.digitalRiverToken) {
    throw new AuthenticationError('Unauthorized application!')
  }

  if (!settings.vtexAppKey || !settings.vtexAppToken) {
    throw new AuthenticationError('Missing VTEX app key and token')
  }

  const checkoutRequest = (await json(req)) as CheckoutRequest

  logger.info({
    message: 'DigitalRiverTaxCalculation-vtexRequestBody',
    checkoutRequest,
  })

  if (!checkoutRequest?.orderFormId) {
    throw new UserInputError('No orderForm ID provided')
  }

  const orderFormData = await orderForm.getOrderForm(
    checkoutRequest.orderFormId,
    settings.vtexAppKey,
    settings.vtexAppToken
  )

  logger.info({
    message: 'DigitalRiverTaxCalculation-orderFormData',
    orderFormData,
  })

  const shippingCountry = checkoutRequest?.shippingDestination?.country
    ? convertIso3To2(checkoutRequest.shippingDestination.country)
    : ''

  let locale = 'en_US'

  if (shippingCountry && shippingCountry in COUNTRIES_LANGUAGES) {
    locale = COUNTRIES_LANGUAGES[shippingCountry]
  }

  const items = []
  const docks = []

  for (const item of checkoutRequest.items) {
    const newItem: CheckoutItem = {
      skuId: item.sku,
      quantity: item.quantity,
      price: item.itemPrice,
      discount: item.discountPrice
        ? {
            amountOff: Math.abs(item.discountPrice / item.quantity),
            quantity: item.quantity,
          }
        : undefined,
      metadata: {
        taxHubRequestId: item.id,
      },
    }

    items.push(newItem)
    docks.push(item.dockId)
  }

  const shippingTotal = checkoutRequest.totals.find((o) => o.id === 'Shipping')
    ?.value

  const dockInfo = await logistics.getDocksById(docks[0])

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

  const checkoutPayload: DRCheckoutPayload = {
    applicationId,
    currency: orderFormData?.storePreferencesData?.currencyCode ?? 'USD',
    taxInclusive: false,
    email: checkoutRequest.clientData?.email ?? '',
    shipFrom: {
      address: {
        line1: dockInfo.address.street,
        line2: dockInfo.address.complement || '',
        city: dockInfo.address.city,
        postalCode: dockInfo.address.postalCode,
        state: dockInfo.address.state,
        country: convertIso3To2(dockInfo.address.country.acronym),
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
        line1: checkoutRequest.shippingDestination?.street || 'Unknown',
        line2: '',
        city: checkoutRequest.shippingDestination?.city || 'Unknown',
        state: checkoutRequest.shippingDestination?.state || '',
        postalCode: checkoutRequest.shippingDestination?.postalCode || '',
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

  let checkoutResponse = null

  try {
    checkoutResponse = await digitalRiver.createCheckout({
      settings,
      checkoutPayload,
    })
  } catch (err) {
    logger.error({
      error: err,
      orderFormId: checkoutRequest.orderFormId,
      message: 'DigitalRiver-CreateCheckoutFailure',
    })

    throw new ResolverError({
      message: 'Checkout creation failed',
      error: err,
    })
  }

  logger.info({
    message: 'DigitalRiverTaxCalculation-CreateCheckoutResponse',
    checkoutResponse,
  })

  // try {
  //   const orderFormUpdateResult = await orderForm.setCustomFields(
  //     checkoutRequest.orderFormId,
  //     checkoutResponse.id,
  //     checkoutResponse.paymentSessionId
  //   )

  //   logger.info({
  //     message: 'DigitalRiverTaxCalculation-UpdateOrderFormResult',
  //     orderFormUpdateResult,
  //   })
  // } catch (err) {
  //   logger.error({
  //     error: err,
  //     orderFormId: checkoutRequest.orderFormId,
  //     message: 'DigitalRiver-UpdateOrderFormError',
  //   })

  //   throw new ResolverError({
  //     message: 'OrderForm update failed',
  //     error: err,
  //   })
  // }

  const taxes = [] as ItemTaxResponse[]

  const shippingTax = checkoutResponse.shippingChoice.taxAmount
  let shippingTaxPerItemRounded = 0

  if (shippingTax > 0) {
    const shippingTaxPerItem = shippingTax / checkoutResponse.items.length

    shippingTaxPerItemRounded = Math.floor(shippingTaxPerItem * 100) / 100
  }

  const { id: checkoutId, paymentSessionId } = checkoutResponse

  checkoutResponse.items.forEach((item, index) => {
    const detailsTaxes = [] as Tax[]

    // if (item.tax.amount > 0) {
    detailsTaxes.push({
      name: `TAX`,
      description: `${checkoutId}|${paymentSessionId}`,
      rate: item.tax.rate,
      value: item.tax.amount,
    })
    // }

    if (shippingTaxPerItemRounded) {
      detailsTaxes.push({
        name: `SHIPPING TAX`,
        value: shippingTaxPerItemRounded,
      })
    }

    if (item.importerTax.amount > 0) {
      detailsTaxes.push({
        name: `IMPORTER TAX`,
        value: item.importerTax.amount,
      })
    }

    if (item.duties.amount > 0) {
      detailsTaxes.push({
        name: `DUTIES`,
        value: item.duties.amount,
      })
    }

    if (item.fees.amount > 0) {
      detailsTaxes.push({
        name: `FEES`,
        value: item.fees.amount,
      })

      if (item.fees.taxAmount > 0) {
        detailsTaxes.push({
          name: `FEE TAX`,
          value: item.fees.taxAmount,
        })
      }
    }

    taxes.push({
      id: item.metadata?.taxHubRequestId ?? index.toString(),
      taxes: detailsTaxes,
    })
  })

  logger.info({
    message: 'DigitalRiverTaxCalculation-TaxHubResponse',
    taxHubResponse: { itemTaxResponse: taxes, hooks: [] },
  })

  ctx.body = {
    itemTaxResponse: taxes,
    hooks: [],
  } as TaxResponse

  ctx.set('Content-Type', 'application/vnd.vtex.checkout.minicart.v1+json')

  await next()
}
