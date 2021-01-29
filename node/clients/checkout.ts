import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

const FOUR_SECONDS = 4 * 1000

export default class CheckoutClient extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.adminUserAuthToken ?? '',
      },
      timeout: FOUR_SECONDS,
    })
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
