import type { FC } from 'react'
import React, { useState, useEffect } from 'react'
import { useIntl } from 'react-intl'
import { useQuery, useMutation } from 'react-apollo'
import {
  Layout,
  PageHeader,
  PageBlock,
  Input,
  Button,
  Toggle,
  ToastProvider,
  ToastConsumer,
} from 'vtex.styleguide'
import { useRuntime } from 'vtex.render-runtime'

import AppSettings from './graphql/appSettings.graphql'
import SaveAppSettings from './graphql/saveAppSettings.graphql'
import OrderFormConfiguration from './graphql/orderFormConfiguration.graphql'
import UpdateOrderFormConfiguration from './graphql/updateOrderFormConfiguration.graphql'

const Admin: FC = () => {
  const { formatMessage } = useIntl()
  const { account } = useRuntime()

  const [settingsState, setSettingsState] = useState({
    digitalRiverToken: '',
    isLive: false,
    enableTaxCalculation: false,
  })

  const [settingsLoading, setSettingsLoading] = useState(false)
  const [taxStatus, setTaxStatus] = useState('')

  const { data } = useQuery(AppSettings, {
    variables: {
      version: process.env.VTEX_APP_VERSION,
    },
    ssr: false,
  })

  const { data: orderFormData, refetch } = useQuery(OrderFormConfiguration, {
    ssr: false,
  })

  const [saveSettings] = useMutation(SaveAppSettings)
  const [updateOrderFormConfiguration] = useMutation(
    UpdateOrderFormConfiguration
  )

  useEffect(() => {
    if (!data?.appSettings?.message) return

    const parsedSettings = JSON.parse(data.appSettings.message)

    setSettingsState(parsedSettings)

    if (!orderFormData?.orderFormConfiguration?.taxConfiguration) return

    if (
      orderFormData.orderFormConfiguration.taxConfiguration.url !==
      `http://master--${account}.myvtex.com/_v/api/digital-river/checkout/order-tax`
    ) {
      setTaxStatus(
        formatMessage({
          id: 'admin/digital-river.taxStatus.otherTaxConfiguration',
        })
      )
      setSettingsState({
        ...parsedSettings,
        enableTaxCalculation: false,
      })
    }
  }, [data, orderFormData, account, formatMessage])

  const handleSaveSettings = async (showToast: any) => {
    setSettingsLoading(true)

    // If enableTaxCalulation is true, set Digital River as tax provider
    if (
      settingsState.enableTaxCalculation &&
      orderFormData?.orderFormConfiguration
    ) {
      // but only if it's not already set as tax provider
      if (!orderFormData.orderFormConfiguration.taxConfiguration) {
        orderFormData.orderFormConfiguration.taxConfiguration = {
          url: `http://master--${account}.myvtex.com/_v/api/digital-river/checkout/order-tax`,
          authorizationHeader: settingsState.digitalRiverToken,
          allowExecutionAfterErrors: false,
          integratedAuthentication: false,
          appId: 'vtexus.connector-digital-river',
        }

        // set up custom orderForm fields
        if (
          !orderFormData.orderFormConfiguration.apps ||
          !orderFormData.orderFormConfiguration.apps.length
        ) {
          orderFormData.orderFormConfiguration.apps = [
            {
              id: 'digital-river',
              major: 0,
              fields: ['checkoutId', 'paymentSessionId'],
            },
          ]
        } else if (
          !orderFormData.orderFormConfiguration.apps.find(
            (x: any) => x.id === 'digital-river'
          )
        ) {
          orderFormData.orderFormConfiguration.apps.push({
            id: 'digital-river',
            major: 0,
            fields: ['checkoutId', 'paymentSessionId'],
          })
        }

        await updateOrderFormConfiguration({
          variables: {
            configuration: orderFormData.orderFormConfiguration,
          },
        }).catch((err) => {
          console.error(err)

          setSettingsState({
            ...settingsState,
            enableTaxCalculation: false,
          })
        })
      }
    }

    await saveSettings({
      variables: {
        version: process.env.VTEX_APP_VERSION,
        settings: JSON.stringify(settingsState),
      },
    })
      .catch((err) => {
        console.error(err)
        showToast({
          message: formatMessage({
            id: 'admin/digital-river.saveSettings.failure',
          }),
          duration: 5000,
        })
        setSettingsLoading(false)
      })
      .then(() => {
        showToast({
          message: formatMessage({
            id: 'admin/digital-river.saveSettings.success',
          }),
          duration: 5000,
        })
        refetch()
        setSettingsLoading(false)
      })
  }

  return (
    <ToastProvider positioning="window">
      <ToastConsumer>
        {({ showToast }: { showToast: any }) => (
          <Layout
            pageHeader={
              <PageHeader
                title={formatMessage({
                  id: 'admin/digital-river.title',
                })}
              />
            }
          >
            <PageBlock>
              <section className="pb4">
                <Input
                  label={formatMessage({
                    id: 'admin/digital-river.settings.digitalRiverToken.label',
                  })}
                  value={settingsState.digitalRiverToken}
                  onChange={(e: React.FormEvent<HTMLInputElement>) =>
                    setSettingsState({
                      ...settingsState,
                      digitalRiverToken: e.currentTarget.value,
                    })
                  }
                  helpText={formatMessage({
                    id:
                      'admin/digital-river.settings.digitalRiverToken.helpText',
                  })}
                  token
                />
              </section>
              <section className="pv4">
                <Toggle
                  semantic
                  label={formatMessage({
                    id: 'admin/digital-river.settings.isLive.label',
                  })}
                  size="large"
                  checked={settingsState.isLive}
                  onChange={() => {
                    setSettingsState({
                      ...settingsState,
                      isLive: !settingsState.isLive,
                    })
                  }}
                  helpText={formatMessage({
                    id: 'admin/digital-river.settings.isLive.helpText',
                  })}
                />
              </section>
              <section className="pv4">
                <Toggle
                  semantic
                  label={`${formatMessage({
                    id:
                      'admin/digital-river.settings.enableTaxCalculation.label',
                  })} ${taxStatus}`}
                  size="large"
                  checked={settingsState.enableTaxCalculation}
                  disabled={!!taxStatus}
                  onChange={() => {
                    setSettingsState({
                      ...settingsState,
                      enableTaxCalculation: !settingsState.enableTaxCalculation,
                    })
                  }}
                  helpText={formatMessage({
                    id:
                      'admin/digital-river.settings.enableTaxCalculation.helpText',
                  })}
                />
              </section>
              <section className="pt4">
                <Button
                  variation="primary"
                  onClick={() => handleSaveSettings(showToast)}
                  isLoading={settingsLoading}
                  disabled={!settingsState.digitalRiverToken}
                >
                  {formatMessage({
                    id: 'admin/digital-river.saveSettings.buttonText',
                  })}
                </Button>
              </section>
            </PageBlock>
          </Layout>
        )}
      </ToastConsumer>
    </ToastProvider>
  )
}

export default Admin
