import type { IncomingHttpHeaders } from 'http2'

import convertIso3To2 from 'country-iso-3-to-2'
import type {
  APIContext,
  APIResponse,
  ApprovedAuthorization,
  AvailablePaymentsResponse,
  AuthorizationRequest,
  AuthorizationResponse,
  CardAuthorization,
  CreditCardAuthorized,
  CancellationRequest,
  CancellationResponse,
  FailedAuthorization,
  InboundRequest,
  InboundResponse,
  Maybe,
  MiniCart,
  PaymentMethod,
  PaymentRequest,
  Recipient,
  RefundRequest,
  RefundResponse,
  SettlementRequest,
  SettlementResponse,
} from '@vtex/payment-provider-sdk'
import { isTokenizedCard } from '@vtex/payment-provider-sdk'
import { ResolverError } from '@vtex/api'

import { applicationId, COUNTRIES_LANGUAGES } from '../constants'

type PaymentProviderContext<
  RequestBody = unknown,
  RouteParams = unknown,
  QueryParams = unknown,
  Headers extends IncomingHttpHeaders = IncomingHttpHeaders
> = APIContext<Context, RouteParams, RequestBody, QueryParams, Headers>

interface DigitalRiverAuthorization extends PaymentRequest {
  reference: string
  orderId: string
  paymentMethod: PaymentMethod | 'Digital River'
  paymentMethodCustomCode: Maybe<string>
  merchantName: string
  value: number
  currency: string
  installments: Maybe<number>
  deviceFingerprint: Maybe<string>
  ipAddress: Maybe<string>
  miniCart: MiniCart
  url: Maybe<string>
  callbackUrl: string
  inboundRequestsUrl: string
  returnUrl: Maybe<string>
  recipients: Maybe<Recipient[]>
}

declare const isCardAuthorization: (
  authorization: AuthorizationRequest | DigitalRiverAuthorization
) => authorization is CardAuthorization

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

export function availablePaymentMethods(): AvailablePaymentsResponse {
  return ({
    paymentMethods: [
      // 'American Express',
      'Digital River',
      // 'Diners',
      // 'Discover',
      // 'JCB',
      // 'Maestro',
      // 'Mastercard',
      'Promissories',
      // 'Visa',
    ],
  } as unknown) as AvailablePaymentsResponse
}

export async function authorize(
  ctx: PaymentProviderContext<AuthorizationRequest | DigitalRiverAuthorization>
): Promise<APIResponse<AuthorizationResponse>> {
  const {
    request: { body: content },
    clients: { apps, digitalRiver, orders },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  // check if order already exists in Digital River
  try {
    const getOrdersResponse = await digitalRiver.getOrdersByVTEXOrderId({
      settings,
      orderId: content.orderId,
    })

    if (getOrdersResponse.data?.length) {
      const [order] = getOrdersResponse.data

      let status = 'undefined'

      if (order.state === 'accepted') status = 'approved'
      if (order.state === 'failed' || order.state === 'blocked') {
        status = 'denied'
      }

      return {
        authorizationId: '',
        code: undefined,
        message: `Existing Digital River order located, state is '${order.state}'`,
        paymentId: content.paymentId,
        tid: order.id,
        status,
        acquirer: undefined,
        paymentAppData: undefined,
      } as AuthorizationResponse
    }
  } catch (err) {
    logger.error({
      error: err,
      message: 'DigitalRiver-GetOrdersFailure',
    })
  }

  // Check if payment method is Digital River (or Promissories for testing)
  if (
    content.paymentMethod === 'Digital River' ||
    content.paymentMethod === 'Promissories'
  ) {
    // TODO: get Checkout ID from orderForm
    let digitalRiverCheckoutId = ''
    let orderData = null

    try {
      orderData = await orders.getOrder(content.orderId)
      if (orderData?.customData?.customApps?.length) {
        const customFields = orderData.customData.customApps.find(
          (x: any) => x.id === 'digital-river'
        )

        const { checkoutId } = customFields?.fields || {}

        if (checkoutId) digitalRiverCheckoutId = checkoutId
      }
    } catch (err) {
      logger.error({
        error: err,
        orderId: content.orderId,
        message: 'DigitalRiver-GetVTEXOrderFailure',
      })

      return {
        paymentId: content.paymentId,
        tid: '',
        message: `Get VTEX order error: ${err}`,
        status: 'denied',
      } as FailedAuthorization
    }

    if (!digitalRiverCheckoutId) {
      return {
        paymentId: content.paymentId,
        tid: '',
        message: `No Digital River checkout ID found in VTEX order data`,
        status: 'denied',
      } as FailedAuthorization
    }

    let orderResponse = null

    try {
      orderResponse = await digitalRiver.createOrder({
        settings,
        checkoutId: digitalRiverCheckoutId,
      })
    } catch (err) {
      logger.error({
        error: err,
        orderId: content.orderId,
        message: 'DigitalRiver-CreateOrderFailure',
      })

      return {
        paymentId: content.paymentId,
        tid: '',
        message: `Order creation error: ${err}`,
        status: 'denied',
      } as FailedAuthorization
    }

    const statusUndefined =
      orderResponse.data.state === 'payment_pending' ||
      orderResponse.data.state === 'in_review'

    return {
      authorizationId: '',
      code: orderResponse.status.toString(),
      message: 'Successfully created Digital River order',
      paymentId: content.paymentId,
      tid: orderResponse.data.id,
      status: statusUndefined ? 'undefined' : 'approved',
      acquirer: undefined,
      paymentAppData: undefined,
    } as ApprovedAuthorization
  }

  // NOTE: Credit card processing is not supported yet! The below code is not finalized.
  if (isCardAuthorization(content)) {
    let checkoutId = ''

    if (!settings.enableTaxCalculation) {
      const billingCountry = content.miniCart.billingAddress?.country
        ? convertIso3To2(content.miniCart.billingAddress?.country)
        : ''

      const shippingCountry = content.miniCart.shippingAddress?.country
        ? convertIso3To2(content.miniCart.shippingAddress?.country)
        : ''

      let locale = 'en_US'

      if (
        content.miniCart.shippingAddress?.country &&
        content.miniCart.shippingAddress.country in COUNTRIES_LANGUAGES
      ) {
        locale = COUNTRIES_LANGUAGES[content.miniCart.shippingAddress.country]
      }

      const items = []

      if (content.miniCart.items && content.miniCart.items.length > 0) {
        for (const item of content.miniCart.items) {
          const newItem: CheckoutItem = {
            skuId: item.id ?? '',
            quantity: item.quantity ?? 0,
            price: item.price ?? 0,
            ...(item.discount &&
              item.discount > 0 &&
              item.quantity && {
                discount: {
                  amountOff: Math.abs(item.discount / item.quantity),
                  quantity: item.quantity,
                },
              }),
          }

          items.push(newItem)
        }
      }

      // TODO: fix shipFrom address
      const checkoutPayload: DRCheckoutPayload = {
        upstreamId: content.orderId,
        applicationId,
        currency: content.currency,
        taxInclusive: content.miniCart.taxValue === 0,
        browserIp: content.ipAddress ?? '',
        email: content.miniCart.buyer.email ?? '',
        shipFrom: {
          address: {
            line1: content.miniCart.billingAddress?.street ?? '',
            line2: content.miniCart.billingAddress?.complement ?? '',
            city: content.miniCart.billingAddress?.city ?? '',
            postalCode: content.miniCart.billingAddress?.postalCode ?? '',
            state: content.miniCart.billingAddress?.state ?? '',
            country: settings.isLive ? billingCountry : shippingCountry,
          },
        },
        shipTo: {
          name: `${content.miniCart.buyer.firstName} ${content.miniCart.buyer.lastName}`,
          phone: content.miniCart.buyer.phone ?? '',
          address: {
            line1: content.miniCart.shippingAddress?.street ?? '',
            line2: content.miniCart.shippingAddress?.complement ?? '',
            city: content.miniCart.shippingAddress?.city ?? '',
            state: content.miniCart.shippingAddress?.state ?? '',
            postalCode: content.miniCart.shippingAddress?.postalCode ?? '',
            country: shippingCountry,
          },
        },
        items,
        shippingChoice: {
          amount: content.miniCart.shippingValue ?? 0,
          description: '',
          serviceLevel: '',
        },
        metadata: {
          paymentId: content.paymentId,
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
          orderId: content.orderId,
          message: 'DigitalRiver-CreateCheckoutFailure',
        })

        throw new ResolverError({
          message: 'Checkout creation failed',
          error: err,
        })
      }

      const sourcePayload = {
        type: 'creditCard',
        paymentSessionId: checkoutResponse.paymentSessionId,
        reusable: false,
        owner: {
          firstName: content.miniCart.buyer.firstName,
          lastName: content.miniCart.buyer.lastName,
          email: content.miniCart.buyer.email ?? '',
          address: {
            line1: content.miniCart.billingAddress?.street ?? '',
            line2: content.miniCart.billingAddress?.complement ?? '',
            city: content.miniCart.billingAddress?.city ?? '',
            state: content.miniCart.billingAddress?.state ?? '',
            postalCode: content.miniCart.billingAddress?.postalCode ?? '',
            country: billingCountry,
          },
        },
        creditCard: {
          brand: content.paymentMethod,
          number: !isTokenizedCard(content.card) ? content.card.number : '',
          expirationMonth: parseInt(content.card.expiration.month, 10),
          expirationYear: parseInt(content.card.expiration.year, 10),
          cvv: !isTokenizedCard(content.card) ? content.card.csc : '',
        },
      }

      let sourceResponse = null

      try {
        sourceResponse = await digitalRiver.createSource({
          settings,
          payload: sourcePayload,
        })
      } catch (err) {
        logger.error({
          error: err,
          orderId: content.orderId,
          message: 'DigitalRiver-CreateSourceFailure',
        })

        throw new ResolverError({
          message: 'Source creation error',
          error: err,
        })
      }

      if (sourceResponse.state === 'failed') {
        // return payment status 'denied' if source creation failed
        return {
          authorizationId: '',
          code: '200',
          message: 'Source creation failed',
          paymentId: content.paymentId,
          tid: checkoutResponse.id,
          status: 'approved',
          acquirer: 'Digital River',
          paymentAppData: undefined,
        } as CreditCardAuthorized
      }

      let checkoutUpdateResponse = null

      try {
        checkoutUpdateResponse = await digitalRiver.updateCheckoutWithSource({
          settings,
          checkoutId: checkoutResponse.id,
          sourceId: sourceResponse.id,
        })
      } catch (err) {
        logger.error({
          error: err,
          orderId: content.orderId,
          message: 'DigitalRiver-UpdateCheckoutFailure',
        })

        throw new ResolverError({
          message: 'Checkout update error',
          error: err,
        })
      }

      checkoutId = checkoutUpdateResponse.id
    } else {
      // enableTaxCalculation is true so checkoutId should be available from the orderForm
    }

    let orderResponse = null

    try {
      orderResponse = await digitalRiver.createOrder({
        settings,
        checkoutId,
      })
    } catch (err) {
      logger.error({
        error: err,
        orderId: content.orderId,
        message: 'DigitalRiver-CreateOrderFailure',
      })

      throw new ResolverError({ message: 'Order creation error', error: err })
    }

    const statusUndefined =
      orderResponse.data.state === 'payment_pending' ||
      orderResponse.data.state === 'in_review'

    return {
      authorizationId: '',
      code: orderResponse.status.toString(),
      message: 'Successfully created Digital River order',
      paymentId: content.paymentId,
      tid: orderResponse.data.id,
      status: statusUndefined ? 'undefined' : 'approved',
      acquirer: undefined,
      paymentAppData: undefined,
    } as CreditCardAuthorized
  }

  return {
    authorizationId: '',
    code: undefined,
    message: 'Payment method not supported',
    paymentId: content.paymentId,
    tid: '',
    status: 'denied',
    acquirer: undefined,
    paymentAppData: undefined,
  } as FailedAuthorization
}

export async function settle(
  ctx: PaymentProviderContext<SettlementRequest>
): Promise<SettlementResponse> {
  const {
    request: {
      body: { paymentId, requestId, transactionId, value },
    },
    clients: { apps, digitalRiver },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  let getOrderResponse = null

  try {
    getOrderResponse = await digitalRiver.getOrderById({
      settings,
      orderId: transactionId,
    })
  } catch (err) {
    logger.error({
      error: err,
      transactionId,
      paymentId,
      message: 'DigitalRiver-GetOrderByIdFailure',
    })

    throw new ResolverError({ message: 'Get order by ID error', error: err })
  }

  const payload = {
    items: getOrderResponse.items,
    orderId: transactionId,
  } as DRFulfillmentPayload

  let settleResponse = null

  try {
    settleResponse = await digitalRiver.fulfillOrCancelOrder({
      settings,
      payload,
    })
  } catch (err) {
    logger.error({
      error: err,
      transactionId,
      paymentId,
      message: 'DigitalRiver-FulfillmentFailure',
    })

    throw new ResolverError({ message: 'Fulfillment error', error: err })
  }

  return {
    settleId: settleResponse.id,
    code: undefined,
    message: 'Successfully settled',
    paymentId,
    value,
    requestId,
  } as SettlementResponse
}

export async function refund(
  ctx: PaymentProviderContext<RefundRequest>
): Promise<RefundResponse> {
  const {
    request: {
      body: { paymentId, requestId, transactionId, value },
    },
    clients: { digitalRiver, apps },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  let getOrderResponse = null

  try {
    getOrderResponse = await digitalRiver.getOrderById({
      settings,
      orderId: transactionId,
    })
  } catch (err) {
    logger.error({
      error: err,
      transactionId,
      paymentId,
      message: 'DigitalRiver-GetOrderByIdFailure',
    })

    throw new ResolverError({ message: 'Get order by ID error', error: err })
  }

  const payload = {
    orderId: transactionId,
    currency: getOrderResponse.currency,
    amount: value,
  } as DRRefundPayload

  let refundResponse = null

  try {
    refundResponse = await digitalRiver.refundOrder({ settings, payload })
  } catch (err) {
    logger.error({
      error: err,
      transactionId,
      paymentId,
      message: 'DigitalRiver-RefundOrderFailure',
    })

    throw new ResolverError({ message: 'Refund failure', error: err })
  }

  return {
    refundId: refundResponse.id,
    code: undefined,
    message: 'Successfully refunded',
    paymentId,
    requestId,
    value,
  } as RefundResponse
}

export async function cancel(
  ctx: PaymentProviderContext<CancellationRequest>
): Promise<CancellationResponse> {
  const {
    request: {
      body: { transactionId, paymentId, requestId },
    },
    clients: { digitalRiver, apps },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  let getOrderResponse = null

  try {
    getOrderResponse = await digitalRiver.getOrderById({
      settings,
      orderId: transactionId,
    })
  } catch (err) {
    logger.error({
      error: err,
      transactionId,
      paymentId,
      message: 'DigitalRiver-GetOrderByIdFailure',
    })

    throw new ResolverError({ message: 'Get order by ID error', error: err })
  }

  const payload = {
    orderId: transactionId,
    items: getOrderResponse.items,
  } as DRFulfillmentPayload

  let cancelResponse = null

  try {
    cancelResponse = await digitalRiver.fulfillOrCancelOrder({
      settings,
      payload,
    })
  } catch (err) {
    logger.error({
      error: err,
      transactionId,
      paymentId,
      message: 'DigitalRiver-CancelOrderFailure',
    })

    throw new ResolverError({ message: 'Cancel order error', error: err })
  }

  return {
    cancellationId: cancelResponse.id,
    code: undefined,
    message: 'Successfully cancelled',
    transactionId,
    paymentId,
    requestId,
  } as CancellationResponse
}

// not using inbound requests yet
export function inbound({
  request: {
    body: { requestId, paymentId, ...content },
  },
}: PaymentProviderContext<InboundRequest>): InboundResponse {
  return {
    paymentId,
    code: undefined,
    message: undefined,
    requestId,
    responseData: {
      content: JSON.stringify(content),
      contentType: 'application/json',
      statusCode: 200,
    },
  }
}
