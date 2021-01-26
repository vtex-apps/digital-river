import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

import { withToken } from './utils'

export default class LogisticsClient extends JanusClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, withToken(context.adminUserAuthToken)(options))
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
        `${this.routes.root()}/logistics/pvt/configuration/docks/${dockId}?an=${
          this.context.account
        }`,
      sku: (skuId: string) =>
        `${this.routes.root()}/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`,
    }
  }
}
