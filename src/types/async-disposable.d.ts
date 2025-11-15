// TODO(agent): remove once tsconfig enables the built-in esnext.disposable lib.
// The mongodb@7 type definitions expect AsyncDisposable globals, and TypeScript
// will provide them natively once we opt into that lib.
declare global {
  interface AsyncDisposable {
    [Symbol.asyncDispose](): PromiseLike<void>
  }

  interface SymbolConstructor {
    readonly asyncDispose: unique symbol
  }
}

export {}
