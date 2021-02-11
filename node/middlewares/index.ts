import type { IncomingHttpHeaders } from 'http2'

// import convertIso3To2 from 'country-iso-3-to-2'
import type {
  APIContext,
  APIResponse,
  ApprovedAuthorization,
  AvailablePaymentsResponse,
  AuthorizationRequest,
  AuthorizationResponse,
  // CardAuthorization,
  // CreditCardAuthorized,
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
// import { isTokenizedCard } from '@vtex/payment-provider-sdk'
import { ResolverError } from '@vtex/api'

// import { applicationId, COUNTRIES_LANGUAGES } from '../constants'

type PaymentProviderContext<
  RequestBody = unknown,
  RouteParams = unknown,
  QueryParams = unknown,
  Headers extends IncomingHttpHeaders = IncomingHttpHeaders
> = APIContext<Context, RouteParams, RequestBody, QueryParams, Headers>

interface DigitalRiverAuthorization extends PaymentRequest {
  reference: string
  orderId: string
  paymentMethod: PaymentMethod | 'DigitalRiver'
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

// declare const isCardAuthorization: (
//   authorization: AuthorizationRequest | DigitalRiverAuthorization
// ) => authorization is CardAuthorization

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

export function availablePaymentMethods(): AvailablePaymentsResponse {
  return ({
    paymentMethods: [
      // 'American Express',
      'DigitalRiver',
      // 'Diners',
      // 'Discover',
      // 'JCB',
      // 'Maestro',
      // 'Mastercard',
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

  logger.info({
    message: 'DigitalRiverAuthorize-requestReceived',
    data: content,
  })

  // check if order already exists in Digital River
  logger.info({
    message: 'DigitalRiverAuthorize-getDigitalRiverOrderRequest',
    payload: {
      upstreamId: content.reference,
    },
  })

  try {
    const getOrdersResponse = await digitalRiver.getOrdersByUpstreamId({
      settings,
      upstreamId: content.reference,
    })

    if (getOrdersResponse.data?.length) {
      const [order] = getOrdersResponse.data

      let status = 'Undefined'

      if (order.state === 'accepted') status = 'Approved'
      if (order.state === 'failed' || order.state === 'blocked') {
        status = 'Denied'
      }

      logger.info({
        message: 'DigitalRiverAuthorize-getDigitalRiverOrderResponse',
        data: order,
        orderId: content.orderId,
        status,
      })

      logger.info({
        message: `DigitalRiverAuthorize-payment${status}`,
        orderId: content.orderId,
      })

      return {
        authorizationId: '',
        code: undefined,
        message: `Existing Digital River order located using Upstream ID ${content.reference}, state is '${order.state}'`,
        paymentId: content.paymentId,
        tid: order.id,
        status: status.toLowerCase(),
        acquirer: undefined,
        paymentAppData: undefined,
      } as AuthorizationResponse
    }
  } catch (err) {
    logger.error({
      error: err,
      orderId: content.orderId,
      message: 'DigitalRiverAuthorize-getDigitalRiverOrdersFailure',
    })
  }

  // Check if payment method is Digital River
  if (content.paymentMethod === 'DigitalRiver') {
    let digitalRiverCheckoutId = ''
    let orderData = null
    const [originatingAccount] = content.url?.split('/')[2].split('.') ?? ['']

    logger.info({
      message: 'DigitalRiverAuthorize-getVTEXOrderRequest',
      payload: {
        orderId: `${content.orderId}-01`,
        originatingAccount,
      },
    })

    try {
      orderData = await orders.getOrder({
        orderId: `${content.orderId}-01`,
        originatingAccount,
        vtexAppKey: settings.vtexAppKey,
        vtexAppToken: settings.vtexAppToken,
      })

      logger.info({
        message: 'DigitalRiverAuthorize-getVTEXOrderResponse',
        orderId: content.orderId,
        data: orderData,
      })

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
        message: 'DigitalRiverAuthorize-getVTEXOrderFailure',
      })

      logger.info({
        message: `DigitalRiverAuthorize-paymentDenied`,
        orderId: content.orderId,
      })

      return {
        paymentId: content.paymentId,
        tid: '',
        message: `Get VTEX order ${content.orderId} error: ${err}`,
        status: 'denied',
      } as FailedAuthorization
    }

    if (!digitalRiverCheckoutId) {
      logger.error({
        message: 'DigitalRiverAuthorize-noCheckoutIdFound',
        orderId: content.orderId,
      })

      logger.info({
        message: `DigitalRiverAuthorize-paymentDenied`,
        orderId: content.orderId,
      })

      return {
        paymentId: content.paymentId,
        tid: '',
        message: `No Digital River Checkout ID found in VTEX order data`,
        status: 'denied',
      } as FailedAuthorization
    }

    let updateCheckoutResponse = null

    logger.info({
      message: 'DigitalRiverAuthorize-updateCheckoutRequest',
      payload: {
        checkoutId: digitalRiverCheckoutId,
        upstreamId: content.reference,
      },
    })

    try {
      updateCheckoutResponse = await digitalRiver.updateCheckoutWithUpstreamId({
        settings,
        checkoutId: digitalRiverCheckoutId,
        upstreamId: content.reference,
      })

      logger.info({
        message: 'DigitalRiverAuthorize-updateCheckoutResponse',
        orderId: content.orderId,
        data: updateCheckoutResponse,
      })
    } catch (err) {
      logger.error({
        error: err,
        orderId: content.orderId,
        message: 'DigitalRiverAuthorize-updateCheckoutFailure',
      })

      logger.info({
        message: `DigitalRiverAuthorize-paymentDenied`,
        orderId: content.orderId,
      })

      return {
        paymentId: content.paymentId,
        tid: '',
        message: `Update checkout error for Checkout ID ${digitalRiverCheckoutId}: ${err}`,
        status: 'denied',
      } as FailedAuthorization
    }

    let orderResponse = null

    logger.info({
      message: 'DigitalRiverAuthorize-createOrderRequest',
      payload: {
        checkoutId: digitalRiverCheckoutId,
      },
    })

    try {
      orderResponse = await digitalRiver.createOrder({
        settings,
        checkoutId: digitalRiverCheckoutId,
      })

      logger.info({
        message: 'DigitalRiverAuthorize-createOrderResponse',
        orderId: content.orderId,
        data: orderResponse,
      })
    } catch (err) {
      logger.error({
        error: err,
        orderId: content.orderId,
        message: 'DigitalRiverAuthorize-createOrderFailure',
      })

      logger.info({
        message: `DigitalRiverAuthorize-paymentDenied`,
        orderId: content.orderId,
      })

      return {
        paymentId: content.paymentId,
        tid: '',
        message: `Order creation error for Checkout ID ${digitalRiverCheckoutId}: ${err}`,
        status: 'denied',
      } as FailedAuthorization
    }

    const statusUndefined =
      orderResponse.data.state === 'payment_pending' ||
      orderResponse.data.state === 'in_review'

    logger.info({
      message: `DigitalRiverAuthorize-payment${
        statusUndefined ? 'Undefined' : 'Approved'
      }`,
      orderId: content.orderId,
    })

    return {
      authorizationId: orderResponse.data.id,
      code: orderResponse.status.toString(),
      message: `Successfully created Digital River order using Checkout ID ${digitalRiverCheckoutId}. See TID field for Digital River Order ID. Digital River order state is ${orderResponse.data.state}.`,
      paymentId: content.paymentId,
      tid: orderResponse.data.id,
      status: statusUndefined ? 'undefined' : 'approved',
      acquirer: undefined,
      paymentAppData: undefined,
    } as ApprovedAuthorization
  }

  // NOTE: Credit card processing is not supported yet! The below code is not finalized.
  // if (isCardAuthorization(content)) {
  //   let checkoutId = ''

  //   if (!settings.enableTaxCalculation) {
  //     const billingCountry = content.miniCart.billingAddress?.country
  //       ? convertIso3To2(content.miniCart.billingAddress?.country)
  //       : ''

  //     const shippingCountry = content.miniCart.shippingAddress?.country
  //       ? convertIso3To2(content.miniCart.shippingAddress?.country)
  //       : ''

  //     let locale = 'en_US'

  //     if (
  //       content.miniCart.shippingAddress?.country &&
  //       content.miniCart.shippingAddress.country in COUNTRIES_LANGUAGES
  //     ) {
  //       locale = COUNTRIES_LANGUAGES[content.miniCart.shippingAddress.country]
  //     }

  //     const items = []

  //     if (content.miniCart.items && content.miniCart.items.length > 0) {
  //       for (const item of content.miniCart.items) {
  //         const newItem: CheckoutItem = {
  //           skuId: item.id ?? '',
  //           quantity: item.quantity ?? 0,
  //           price: item.price ?? 0,
  //           ...(item.discount &&
  //             item.discount > 0 &&
  //             item.quantity && {
  //               discount: {
  //                 amountOff: Math.abs(item.discount / item.quantity),
  //                 quantity: item.quantity,
  //               },
  //             }),
  //         }

  //         items.push(newItem)
  //       }
  //     }

  //     // TODO: fix shipFrom address
  //     const checkoutPayload: DRCheckoutPayload = {
  //       upstreamId: content.orderId,
  //       applicationId,
  //       currency: content.currency,
  //       taxInclusive: content.miniCart.taxValue === 0,
  //       browserIp: content.ipAddress ?? '',
  //       email: content.miniCart.buyer.email ?? '',
  //       shipFrom: {
  //         address: {
  //           line1: content.miniCart.billingAddress?.street ?? '',
  //           line2: content.miniCart.billingAddress?.complement ?? '',
  //           city: content.miniCart.billingAddress?.city ?? '',
  //           postalCode: content.miniCart.billingAddress?.postalCode ?? '',
  //           state: content.miniCart.billingAddress?.state ?? '',
  //           country: settings.isLive ? billingCountry : shippingCountry,
  //         },
  //       },
  //       shipTo: {
  //         name: `${content.miniCart.buyer.firstName} ${content.miniCart.buyer.lastName}`,
  //         phone: content.miniCart.buyer.phone ?? '',
  //         address: {
  //           line1: content.miniCart.shippingAddress?.street ?? '',
  //           line2: content.miniCart.shippingAddress?.complement ?? '',
  //           city: content.miniCart.shippingAddress?.city ?? '',
  //           state: content.miniCart.shippingAddress?.state ?? '',
  //           postalCode: content.miniCart.shippingAddress?.postalCode ?? '',
  //           country: shippingCountry,
  //         },
  //       },
  //       items,
  //       shippingChoice: {
  //         amount: content.miniCart.shippingValue ?? 0,
  //         description: '',
  //         serviceLevel: '',
  //       },
  //       metadata: {
  //         paymentId: content.paymentId,
  //       },
  //       locale,
  //     }

  //     let checkoutResponse = null

  //     try {
  //       checkoutResponse = await digitalRiver.createCheckout({
  //         settings,
  //         checkoutPayload,
  //       })
  //     } catch (err) {
  //       logger.error({
  //         error: err,
  //         orderId: content.orderId,
  //         message: 'DigitalRiverAuthorize-createCheckoutFailure',
  //       })

  //       throw new ResolverError({
  //         message: 'Checkout creation failed',
  //         error: err,
  //       })
  //     }

  //     const sourcePayload = {
  //       type: 'creditCard',
  //       paymentSessionId: checkoutResponse.paymentSessionId,
  //       reusable: false,
  //       owner: {
  //         firstName: content.miniCart.buyer.firstName,
  //         lastName: content.miniCart.buyer.lastName,
  //         email: content.miniCart.buyer.email ?? '',
  //         address: {
  //           line1: content.miniCart.billingAddress?.street ?? '',
  //           line2: content.miniCart.billingAddress?.complement ?? '',
  //           city: content.miniCart.billingAddress?.city ?? '',
  //           state: content.miniCart.billingAddress?.state ?? '',
  //           postalCode: content.miniCart.billingAddress?.postalCode ?? '',
  //           country: billingCountry,
  //         },
  //       },
  //       creditCard: {
  //         brand: content.paymentMethod,
  //         number: !isTokenizedCard(content.card) ? content.card.number : '',
  //         expirationMonth: parseInt(content.card.expiration.month, 10),
  //         expirationYear: parseInt(content.card.expiration.year, 10),
  //         cvv: !isTokenizedCard(content.card) ? content.card.csc : '',
  //       },
  //     }

  //     let sourceResponse = null

  //     try {
  //       sourceResponse = await digitalRiver.createSource({
  //         settings,
  //         payload: sourcePayload,
  //       })
  //     } catch (err) {
  //       logger.error({
  //         error: err,
  //         orderId: content.orderId,
  //         message: 'DigitalRiverAuthorize-createSourceFailure',
  //       })

  //       throw new ResolverError({
  //         message: 'Source creation error',
  //         error: err,
  //       })
  //     }

  //     if (sourceResponse.state === 'failed') {
  //       // return payment status 'denied' if source creation failed
  //       return {
  //         authorizationId: '',
  //         code: '200',
  //         message: 'Source creation failed',
  //         paymentId: content.paymentId,
  //         tid: checkoutResponse.id,
  //         status: 'approved',
  //         acquirer: 'Digital River',
  //         paymentAppData: undefined,
  //       } as CreditCardAuthorized
  //     }

  //     let checkoutUpdateResponse = null

  //     try {
  //       checkoutUpdateResponse = await digitalRiver.updateCheckoutWithSource({
  //         settings,
  //         checkoutId: checkoutResponse.id,
  //         sourceId: sourceResponse.id,
  //       })
  //     } catch (err) {
  //       logger.error({
  //         error: err,
  //         orderId: content.orderId,
  //         message: 'DigitalRiverAuthorize-updateCheckoutFailure',
  //       })

  //       throw new ResolverError({
  //         message: 'Checkout update error',
  //         error: err,
  //       })
  //     }

  //     checkoutId = checkoutUpdateResponse.id
  //   } else {
  //     // enableTaxCalculation is true so checkoutId should be available from the orderForm
  //   }

  //   let orderResponse = null

  //   try {
  //     orderResponse = await digitalRiver.createOrder({
  //       settings,
  //       checkoutId,
  //     })
  //   } catch (err) {
  //     logger.error({
  //       error: err,
  //       orderId: content.orderId,
  //       message: 'DigitalRiverAuthorize-createOrderFailure',
  //     })

  //     throw new ResolverError({ message: 'Order creation error', error: err })
  //   }

  //   const statusUndefined =
  //     orderResponse.data.state === 'payment_pending' ||
  //     orderResponse.data.state === 'in_review'

  //   return {
  //     authorizationId: '',
  //     code: orderResponse.status.toString(),
  //     message: 'Successfully created Digital River order',
  //     paymentId: content.paymentId,
  //     tid: orderResponse.data.id,
  //     status: statusUndefined ? 'undefined' : 'approved',
  //     acquirer: undefined,
  //     paymentAppData: undefined,
  //   } as CreditCardAuthorized
  // }
  // END Credit Card processing block

  logger.warn({
    message: 'DigitalRiverAuthorize-paymentMethodNotSupported',
    data: content,
  })

  logger.info({
    message: `DigitalRiverAuthorize-paymentDenied`,
    orderId: content.orderId,
  })

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
      body,
      body: { paymentId, requestId, value },
    },
    clients: { apps, digitalRiver },
    vtex: { logger },
  } = ctx

  const { tid } = ctx.request.body as any

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  logger.info({
    message: 'DigitalRiverSettle-requestReceived',
    data: body,
  })

  let getOrderResponse = null

  logger.info({
    message: 'DigitalRiverSettle-getDigitalRiverOrderRequest',
    paymentId,
    payload: {
      orderId: tid,
    },
  })

  try {
    getOrderResponse = await digitalRiver.getOrderById({
      settings,
      orderId: tid,
    })

    logger.info({
      message: 'DigitalRiverSettle-getDigitalRiverOrderResponse',
      tid,
      paymentId,
      data: getOrderResponse,
    })
  } catch (err) {
    logger.error({
      error: err,
      tid,
      paymentId,
      message: 'DigitalRiverSettle-getOrderByIdFailure',
    })

    throw new ResolverError({
      message: `Get order by ID error using Digital River Order ID ${tid}`,
      error: err,
    })
  }

  const payload = {
    items: getOrderResponse.items.map((item) => {
      return {
        itemId: item.id,
        quantity: item.quantity,
      }
    }),
    orderId: getOrderResponse.id,
  } as DRFulfillmentPayload

  let settleResponse = null

  logger.info({
    message: 'DigitalRiverSettle-settleRequest',
    paymentId,
    payload,
  })
  try {
    settleResponse = await digitalRiver.fulfillOrCancelOrder({
      settings,
      payload,
    })

    logger.info({
      message: 'DigitalRiverSettle-settleResponse',
      digitalRiverOrderId: getOrderResponse.id,
      paymentId,
      data: settleResponse,
    })
  } catch (err) {
    logger.error({
      error: err,
      digitalRiverOrderId: getOrderResponse.id,
      paymentId,
      message: 'DigitalRiverSettle-fulfillmentFailure',
    })

    throw new ResolverError({
      message: `Settlement error for Digital River Order ID ${getOrderResponse.id}`,
      error: err,
    })
  }

  return {
    settleId: settleResponse.id,
    code: undefined,
    message: `Successfully settled Digital River Order ID ${getOrderResponse.id}`,
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
      body,
      body: { paymentId, requestId, value },
    },
    clients: { digitalRiver, apps },
    vtex: { logger },
  } = ctx

  const { tid, authorizationId } = ctx.request.body as any

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  logger.info({
    message: 'DigitalRiverRefund-requestReceived',
    data: body,
  })

  let getOrderResponse = null

  logger.info({
    message: 'DigitalRiverRefund-getDigitalRiverOrderRequest',
    paymentId,
    payload: {
      orderId: tid || authorizationId,
    },
  })

  try {
    getOrderResponse = await digitalRiver.getOrderById({
      settings,
      orderId: tid || authorizationId,
    })

    logger.info({
      message: 'DigitalRiverRefund-getDigitalRiverOrderResponse',
      tid,
      authorizationId,
      paymentId,
      data: getOrderResponse,
    })
  } catch (err) {
    logger.error({
      error: err,
      tid,
      authorizationId,
      paymentId,
      message: 'DigitalRiverRefund-getOrderByIdFailure',
    })

    throw new ResolverError({
      message: `Get order by ID error using Digital River Order ID ${
        tid || authorizationId
      }`,
      error: err,
    })
  }

  const payload = {
    orderId: getOrderResponse.id,
    currency: getOrderResponse.currency,
    amount: value,
  } as DRRefundPayload

  let refundResponse = null

  logger.info({
    message: 'DigitalRiverRefund-refundRequest',
    paymentId,
    payload,
  })

  try {
    refundResponse = await digitalRiver.refundOrder({ settings, payload })

    logger.info({
      message: 'DigitalRiverRefund-refundResponse',
      digitalRiverOrderId: getOrderResponse.id,
      paymentId,
      data: refundResponse,
    })
  } catch (err) {
    logger.error({
      error: err,
      digitalRiverOrderId: getOrderResponse.id,
      paymentId,
      message: 'DigitalRiverRefund-refundOrderFailure',
    })

    throw new ResolverError({
      message: `Refund failure for Digital River Order ID ${getOrderResponse.id}`,
      error: err,
    })
  }

  return {
    refundId: refundResponse.id,
    code: undefined,
    message: `Successfully refunded Digital River Order ID ${getOrderResponse.id}`,
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
      body,
      body: { authorizationId, transactionId, paymentId, requestId },
    },
    clients: { digitalRiver, apps },
    vtex: { logger },
  } = ctx

  const { tid } = ctx.request.body as any

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  logger.info({
    message: 'DigitalRiverCancel-requestReceived',
    data: body,
  })

  let getOrderResponse = null

  logger.info({
    message: 'DigitalRiverCancel-getDigitalRiverOrderRequest',
    paymentId,
    payload: {
      orderId: tid || authorizationId,
    },
  })

  try {
    getOrderResponse = await digitalRiver.getOrderById({
      settings,
      orderId: tid || authorizationId,
    })

    logger.info({
      message: 'DigitalRiverCancel-getDigitalRiverOrderResponse',
      tid,
      authorizationId,
      paymentId,
      data: getOrderResponse,
    })
  } catch (err) {
    logger.error({
      error: err,
      tid,
      authorizationId,
      paymentId,
      message: 'DigitalRiverCancel-getOrderByIdFailure',
    })

    throw new ResolverError({
      message: `Get order by ID error using Digital River Order ID ${
        tid || authorizationId
      }`,
      error: err,
    })
  }

  const payload = {
    orderId: getOrderResponse.id,
    items: getOrderResponse.items.map((item) => {
      return {
        itemId: item.id,
        cancelQuantity: item.quantity,
      }
    }),
  } as DRFulfillmentPayload

  let cancelResponse = null

  logger.info({
    message: 'DigitalRiverCancel-cancelRequest',
    paymentId,
    payload,
  })

  try {
    cancelResponse = await digitalRiver.fulfillOrCancelOrder({
      settings,
      payload,
    })

    logger.info({
      message: 'DigitalRiverCancel-cancelResponse',
      digitalRiverOrderId: getOrderResponse.id,
      paymentId,
      data: cancelResponse,
    })
  } catch (err) {
    logger.error({
      error: err,
      digitalRiverOrderId: getOrderResponse.id,
      paymentId,
      message: 'DigitalRiverCancel-cancelOrderFailure',
    })

    throw new ResolverError({
      message: `Cancel order error for Digital River Order ID ${getOrderResponse.id}`,
      error: err,
    })
  }

  return {
    cancellationId: cancelResponse.id,
    code: undefined,
    message: `Successfully cancelled Digital River Order ID `,
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
