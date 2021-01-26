import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

import { withToken } from './utils'

export default class CheckoutClient extends JanusClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, withToken(context.adminUserAuthToken)(options))
  }

  public orderFormConfiguration = (): Promise<OrderFormConfiguration> =>
    this.http.get<OrderFormConfiguration>(
      this.routes.orderFormConfiguration(),
      {
        metric: 'checkoutClient-orderFormConfiguration',
      }
    )

  public updateOrderFormConfiguration = (
    orderFormConfiguration: OrderFormConfiguration
  ): Promise<OrderFormConfiguration> =>
    this.http.post<OrderFormConfiguration>(
      this.routes.orderFormConfiguration(),
      orderFormConfiguration,
      {
        metric: 'checkoutClient-updateOrderFormConfiguration',
      }
    )

  private get routes() {
    return {
      root: () => '/api/checkout/pvt',
      orderFormConfiguration: () =>
        `${this.routes.root()}/configuration/orderForm`,
    }
  }
}
