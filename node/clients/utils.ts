import type { InstanceOptions } from '@vtex/api'

export const withToken = (token?: string) => (
  options?: InstanceOptions
): InstanceOptions => ({
  ...(options ?? {}),
  headers: {
    ...(options?.headers ?? {}),
    ...(token ? { VtexIdclientAutCookie: token } : {}),
  },
})
