import { ResolverError, UserInputError } from '@vtex/api'
import { json } from 'co-body'

interface UpdateCheckoutRequest {
  checkoutId: string
  sourceId: string
  readyForStorage?: boolean
}

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

export async function digitalRiverUpdateCheckout(ctx: Context) {
  const {
    clients: { apps, digitalRiver },
    req,
    vtex: { logger },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  const updateCheckoutRequest = (await json(req))?.data as UpdateCheckoutRequest

  if (!updateCheckoutRequest?.checkoutId || !updateCheckoutRequest?.sourceId) {
    throw new UserInputError({
      message: 'Checkout ID and Source ID must be provided',
    })
  }

  const { checkoutId, sourceId } = updateCheckoutRequest

  let updateCheckoutResponse = null

  try {
    updateCheckoutResponse = await digitalRiver.updateCheckoutWithSource({
      settings,
      checkoutId,
      sourceId,
    })
  } catch (err) {
    logger.error({
      error: err,
      message: 'DigitalRiver-UpdateCheckoutFailure',
    })

    throw new ResolverError({
      message: 'Update Checkout failure',
      error: err,
    })
  }

  return updateCheckoutResponse
}
