/**
 * Smoke test: verify @revenuecat/purchases-js-hybrid-mappings ESM is parseable by Jest.
 * Reproduces the failure in 4 blocked PRs (#14 #13 #6 #2) where useAuth.Purchases.logOut
 * triggered dynamic import of @revenuecat/purchases-js-hybrid-mappings/dist/index.js.
 * Without the transformIgnorePatterns fix this would throw SyntaxError unexpected token.
 */
describe('@revenuecat/purchases-js-hybrid-mappings ESM parse', () => {
  it('imports without SyntaxError', () => {
    expect(() => {
      const mod = require('@revenuecat/purchases-js-hybrid-mappings');
      expect(mod).toBeDefined();
    }).not.toThrow();
  });
});
