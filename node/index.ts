import type {
  ClientsConfig,
  ServiceContext,
  ParamsContext,
  RecorderState,
} from '@vtex/api'
import { LRUCache, Service } from '@vtex/api'
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
import { digitalRiverUpdateCheckout } from './middlewares/checkout'

const TIMEOUT_MS = 800

// Create a LRU memory cache for the Status client.
// The @vtex/api HttpClient respects Cache-Control headers and uses the provided cache.
const memoryCache = new LRUCache<string, any>({ max: 5000 })

metrics.trackCache('status', memoryCache)

// This is the configuration for clients available in `ctx.clients`.
const clients: ClientsConfig<Clients> = {
  // We pass our custom implementation of the clients bag, containing the Status client.
  implementation: Clients,
  options: {
    // All IO Clients will be initialized with these options, unless otherwise specified.
    default: {
      retries: 2,
      timeout: TIMEOUT_MS,
    },
    // This key will be merged with the default options and add this cache to our Status client.
    status: {
      memoryCache,
    },
  },
}

declare global {
  // We declare a global Context type just to avoid re-writing ServiceContext<Clients, State> in every handler and resolver
  type Context = ServiceContext<Clients>
}

// Export a service that defines route handlers and client options.
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
  routes: implementsAPI<PaymentProviderProtocol<Context>>({
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
    digitalRiverOrderTaxHandler: { POST: digitalRiverOrderTaxHandler },
    updateCheckout: { POST: digitalRiverUpdateCheckout },
  }),
})
