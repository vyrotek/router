import * as React from 'react'
import invariant from 'tiny-invariant'
import {
  LoaderClient,
  RegisteredLoaders,
  LoaderInstanceByKey,
  LoaderClientOptions,
  LoaderInstance,
  HydrateUpdater,
  AnyLoader,
  GetInstanceOptions,
  NullableLoaderInstance,
  LoadersToRecord,
  LoaderByKey,
  hashKey,
  createLoaderInstance,
} from '@tanstack/loaders'
import { useStore } from '@tanstack/react-store'

export * from '@tanstack/loaders'

//

export type NoInfer<T> = [T][T extends any ? 0 : never]

const loadersContext = React.createContext<{
  client: LoaderClient<any>
  // state: LoaderClientState<any>
}>(null as any)

const useLayoutEffect =
  typeof document !== 'undefined' ? React.useLayoutEffect : React.useEffect

export function LoaderClientProvider({
  client,
  children,
  ...rest
}: {
  client: LoaderClient<any>
  children: any
} & Omit<LoaderClientOptions<any>, 'loaders'>) {
  client.options = {
    ...client.options,
    ...rest,
  }

  // const [state, _setState] = React.useState(() => client.state)

  // useLayoutEffect(() => {
  //   return client.__store.subscribe(() => {
  //     Promise.resolve().then(() => {
  //       ;(React.startTransition || ((d) => d()))(() => _setState(client.state))
  //     })
  //   })
  // })

  React.useEffect(client.mount, [client])

  return (
    <loadersContext.Provider value={{ client }}>
      {children}
    </loadersContext.Provider>
  )
}

type NullableLoaderInstance_<TLoaderInstance> =
  TLoaderInstance extends LoaderInstance<
    infer TVariables,
    infer TData,
    infer TError
  >
    ? NullableLoaderInstance<TVariables, TData, TError>
    : never

export function useLoaderInstance<
  TLoader_ extends AnyLoader = RegisteredLoaders,
  TLoaders extends LoadersToRecord<TLoader_> = LoadersToRecord<TLoader_>,
  TKey extends keyof TLoaders = keyof TLoaders,
  TLoader extends LoaderByKey<TLoaders, TKey> = LoaderByKey<TLoaders, TKey>,
  TLoaderInstance extends LoaderInstanceByKey<
    TLoaders,
    TKey
  > = LoaderInstanceByKey<TLoaders, TKey>,
  TVariables extends TLoaderInstance['variables'] = TLoaderInstance['variables'],
  TData extends TLoaderInstance['data'] = TLoaderInstance['data'],
  TError extends TLoaderInstance['error'] = TLoaderInstance['error'],
  TStrict extends unknown = true,
  TSelected = TStrict extends false
    ? NullableLoaderInstance_<TLoaderInstance>
    : TLoaderInstance,
>(
  opts: GetInstanceOptions<TKey, TLoader> & {
    strict?: TStrict
    throwOnError?: boolean
    hydrate?: HydrateUpdater<TVariables, TData, TError>
    select?: (
      loaderStore: TStrict extends false
        ? NullableLoaderInstance_<TLoaderInstance>
        : TLoaderInstance,
    ) => TSelected
  },
): TSelected {
  const ctx = React.useContext(loadersContext)

  invariant(
    ctx,
    `useLoaderInstance must be used inside a <LoaderClientProvider> component or be provided one via the 'client' option!`,
  )

  const { client } = ctx

  const { key, variables } = opts
  const hashedKey = hashKey([key, variables])

  // Before anything runs, attempt hydration
  client.__hydrateLoaderInstance(opts as any)

  const defaultInstance = React.useMemo(
    () =>
      createLoaderInstance({
        ...(opts as any),
        hashedKey,
      }),
    [hashedKey],
  )

  const { status, loadPromise, error } = useStore(client.__store, (state) => {
    return pick(
      (client.state.loaders[opts.key].instances[hashedKey] || defaultInstance)!,
      ['status', 'error', 'loadPromise'],
    )
  })

  const selected = useStore(client.__store, (state) => {
    const instance =
      client.state.loaders[opts.key].instances[hashedKey] || defaultInstance
    return opts.select?.(instance as any) ?? instance
  })

  if (status === 'error' && (opts?.throwOnError ?? true)) {
    throw error
  }

  if (opts?.strict ?? true) {
    if (status === 'pending') {
      // throw new Error('this should never happen')
      throw loadPromise
    }
  }

  // If we're still in an idle state, we need to suspend via load
  if (status === 'idle') {
    throw client.load(opts)
  }

  React.useEffect(() => {
    client.load(opts)
  }, [client])

  useLayoutEffect(() => {
    return client.subscribeToInstance(opts, () => {})
  }, [hashedKey])

  // useStore(instance.__store, (d) => opts?.track?.(d as any) ?? d)

  // If we didn't suspend, dehydrate the loader instance
  client.__dehydrateLoaderInstance(opts as any)

  return selected as any
}

export function useLoaderClient(opts?: {
  // track?: (loaderClientStore: LoaderClientStore) => any
}): LoaderClient<RegisteredLoaders> {
  const ctx = React.useContext(loadersContext)

  if (!ctx)
    invariant(
      'useLoaderClient must be used inside a <LoaderClientProvider> component!',
    )

  // useStore(ctx.__store, (d) => opts?.track?.(d as any) ?? d)

  return ctx.client
}

export function pick<T, K extends keyof T>(parent: T, keys: K[]): Pick<T, K> {
  return keys.reduce((obj: any, key: K) => {
    obj[key] = parent[key]
    return obj
  }, {} as any)
}
