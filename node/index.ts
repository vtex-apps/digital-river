import type {
  ClientsConfig,
  ServiceContext,
  ParamsContext,
  RecorderState,
} from '@vtex/api'
import { Service, method } from '@vtex/api'
import type { PaymentProviderProtocol } from '@vtex/payment-provider-sdk'
import { implementsAPI } from '@vtex/payment-provider-sdk'

import { Clients } from './clients'
import {
  authorize,
  availablePaymentMethods,
  cancel,
  inbound,
  refund,
  settle,
} from './middlewares'
import { digitalRiverOrderTaxHandler } from './middlewares/tax'
import {
  digitalRiverCreateCheckout,
  digitalRiverUpdateCheckout,
  countryCode,
} from './middlewares/checkout'

const TIMEOUT_MS = 800

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    default: {
      retries: 2,
      timeout: TIMEOUT_MS,
    },
  },
}

declare global {
  type Context = ServiceContext<Clients>
}

export default new Service<Clients, RecorderState, ParamsContext>({
  clients,
  graphql: {
    resolvers: {
      Query: {
        orderFormConfiguration: async (_: any, __: any, ctx: Context) => {
          const {
            clients: { checkout },
          } = ctx

          return checkout.orderFormConfiguration()
        },
      },
      Mutation: {
        updateOrderFormConfiguration: async (
          _: any,
          {
            orderFormConfiguration,
          }: { orderFormConfiguration: OrderFormConfiguration },
          ctx: Context
        ) => {
          const {
            clients: { checkout },
            vtex: { logger },
          } = ctx

          let response = null

          try {
            response = await checkout.updateOrderFormConfiguration(
              orderFormConfiguration
            )
          } catch (err) {
            logger.error({
              error: err,
              message: 'DigitalRiver-UpdateOrderFormConfigurationError',
            })
          }

          return response
        },
      },
    },
  },
  routes: {
    ...implementsAPI<PaymentProviderProtocol<Context>>({
      authorizations: {
        POST: authorize,
      },
      cancellations: {
        POST: cancel,
      },
      settlements: {
        POST: settle,
      },
      refunds: { POST: refund },
      paymentMethods: {
        GET: availablePaymentMethods,
      },
      inbound: { POST: inbound },
    }),
    digitalRiverOrderTaxHandler: method({
      POST: [digitalRiverOrderTaxHandler],
    }),
    createCheckout: method({ POST: [digitalRiverCreateCheckout] }),
    updateCheckout: method({ POST: [digitalRiverUpdateCheckout] }),
    getISO2CountryCode: method({ GET: [countryCode] }),
  },
})
