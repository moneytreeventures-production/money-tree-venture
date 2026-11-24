export interface ReusableConnection<TSelf> {
  readonly readyState: number;
  asPromise?: () => Promise<TSelf>;
}

export interface ConnectionCache<T extends ReusableConnection<T>> {
  connection: T;
  promise?: Promise<T>;
}

/** Shares one connection attempt and reuses an open connection per runtime. */
export function createConnectionManager<T extends ReusableConnection<T>, TConfig>(
  cache: ConnectionCache<T>,
  connect: (config: TConfig) => Promise<T>,
): (config: TConfig) => Promise<T> {
  return (config) => {
    if (cache.connection.readyState === 1) {
      return Promise.resolve(cache.connection);
    }

    if (cache.promise) {
      return cache.promise;
    }

    const isAlreadyConnecting = cache.connection.readyState === 2;
    const waitForExistingConnection = cache.connection.asPromise;
    const attempt = isAlreadyConnecting && waitForExistingConnection
      ? () => waitForExistingConnection.call(cache.connection)
      : () => connect(config);

    const pending = Promise.resolve()
      .then(attempt)
      .then((connection) => {
        cache.connection = connection;
        return connection;
      })
      .finally(() => {
        if (cache.promise === pending) {
          cache.promise = undefined;
        }
      });

    cache.promise = pending;
    return pending;
  };
}
