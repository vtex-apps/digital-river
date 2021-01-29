import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

const FOUR_SECONDS = 4 * 1000

export default class LogisticsClient extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
      },
      timeout: FOUR_SECONDS,
    })
  }

  public getDocksById = (dockId: string) =>
    this.http.get(this.routes.docks(dockId), {
      metric: 'logisticsClient-getDocksById',
    })

  public getSkuById = (skuId: string) =>
    this.http.get(this.routes.sku(skuId), {
      metric: 'logisticsClient-getSkuById',
    })

  private get routes() {
    return {
      root: () => '/api',
      docks: (dockId: string) =>
        `${this.routes.root()}/logistics/pvt/configuration/docks/${dockId}`,
      sku: (skuId: string) =>
        `${this.routes.root()}/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`,
    }
  }
}
