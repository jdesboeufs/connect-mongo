// TODO(agent): remove once the compiler is upgraded to TypeScript >= 5.2
// The mongodb@7 type definitions expect AsyncDisposable globals.
declare global {
  interface AsyncDisposable {
    [Symbol.asyncDispose](): PromiseLike<void>
  }

  interface SymbolConstructor {
    readonly asyncDispose: unique symbol
  }
}

export {}
