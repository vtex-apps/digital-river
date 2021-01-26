import { ResolverError } from '@vtex/api'
import { json } from 'co-body'
import convertIso3To2 from 'country-iso-3-to-2'

import { applicationId, COUNTRIES_LANGUAGES } from '../constants'

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

export async function digitalRiverOrderTaxHandler(
  ctx: Context
): Promise<TaxResponse> {
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
    throw new Error('Unauthorized application!')
  }

  const checkoutRequest = (await json(req))?.data as CheckoutRequest

  const orderFormData = await orderForm.getOrderForm(
    checkoutRequest.orderFormId
  )

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
      skuId: item.id,
      quantity: item.quantity,
      price: item.itemPrice,
      discount: item.discountPrice
        ? { amountOff: item.discountPrice, quantity: item.quantity }
        : undefined,
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
    email: checkoutRequest.clientData.email,
    shipFrom: {
      address: {
        line1: `${dockInfo.address.number ?? `${dockInfo.address.number} `}${
          dockInfo.address.street
        }`,
        line2: dockInfo.address.complement ?? '',
        city: dockInfo.address.city,
        postalCode: dockInfo.address.postalCode,
        state: dockInfo.address.state,
        country: convertIso3To2(dockInfo.address.country.acronym),
      },
    },
    shipTo: {
      name: `${orderFormData.clientProfileData.firstName} ${orderFormData.clientProfileData.lastName}`,
      phone: orderFormData.clientProfileData.phone ?? '',
      address: {
        line1: orderFormData.shippingData.address.street ?? '',
        line2: orderFormData.shippingData.address.complement ?? '',
        city: orderFormData.shippingData.address.city ?? '',
        state: orderFormData.shippingData.address.state ?? '',
        postalCode: orderFormData.shippingData.address.postalCode ?? '',
        country: shippingCountry,
      },
    },
    items,
    shippingChoice: {
      amount: shippingTotal ?? 0,
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

  try {
    await orderForm.setCustomFields(
      checkoutRequest.orderFormId,
      checkoutResponse.id,
      checkoutResponse.paymentSessionId
    )
  } catch (err) {
    logger.error({
      error: err,
      orderFormId: checkoutRequest.orderFormId,
      message: 'DigitalRiver-UpdateOrderFormError',
    })

    throw new ResolverError({
      message: 'OrderForm update failed',
      error: err,
    })
  }

  const taxes = [] as ItemTaxResponse[]

  const shippingTax = checkoutResponse.shippingChoice.taxAmount
  let shippingTaxPerItemRounded = 0

  if (shippingTax > 0) {
    const shippingTaxPerItem = shippingTax / checkoutResponse.items.length

    shippingTaxPerItemRounded = Math.floor(shippingTaxPerItem * 100) / 100
  }

  checkoutResponse.items.forEach((item) => {
    const detailsTaxes = [] as Tax[]

    if (item.tax.amount > 0) {
      detailsTaxes.push({
        name: `TAX`,
        rate: item.tax.rate,
        value: item.tax.amount,
      })
    }

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

    taxes.push({ id: item.skuId, taxes: detailsTaxes })
  })

  return {
    itemTaxResponse: taxes,
    hooks: [],
  } as TaxResponse
}
