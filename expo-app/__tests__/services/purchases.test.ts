import {
  checkSubscriptionStatus,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from '../../services/purchases';

// --- Mocks ---

const mockConfigure = jest.fn();
const mockLogIn = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockRestorePurchases = jest.fn();

jest.mock('react-native-purchases', () => {
  const actual = {
    configure: (...args: unknown[]) => mockConfigure(...args),
    logIn: (...args: unknown[]) => mockLogIn(...args),
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  };
  return {
    __esModule: true,
    default: actual,
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR',
    },
  };
});

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// --- Helpers ---

function makeCustomerInfo(activeEntitlements: Record<string, unknown> = {}) {
  return {
    entitlements: {
      active: activeEntitlements,
    },
  };
}

function makePackage(id = 'pkg-1') {
  return { identifier: id, product: { title: 'Pro Mensal' } };
}

// --- Tests ---

describe('checkSubscriptionStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns free when no active entitlements', async () => {
    mockGetCustomerInfo.mockResolvedValueOnce(makeCustomerInfo({}));

    const result = await checkSubscriptionStatus();

    expect(result).toEqual({ plan: 'free', isActive: false });
  });

  it('returns pro when pro entitlement is active', async () => {
    mockGetCustomerInfo.mockResolvedValueOnce(makeCustomerInfo({ pro: { isActive: true } }));

    const result = await checkSubscriptionStatus();

    expect(result).toEqual({ plan: 'pro', isActive: true });
  });

  it('returns enterprise when enterprise entitlement is active', async () => {
    mockGetCustomerInfo.mockResolvedValueOnce(
      makeCustomerInfo({ enterprise: { isActive: true }, pro: { isActive: true } }),
    );

    const result = await checkSubscriptionStatus();

    // Enterprise takes precedence over pro
    expect(result).toEqual({ plan: 'enterprise', isActive: true });
  });

  it('returns free when getCustomerInfo throws', async () => {
    mockGetCustomerInfo.mockRejectedValueOnce(new Error('network'));

    const result = await checkSubscriptionStatus();

    expect(result).toEqual({ plan: 'free', isActive: false });
  });
});

describe('getOfferings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns packages from current offering', async () => {
    const packages = [makePackage('monthly'), makePackage('yearly')];
    mockGetOfferings.mockResolvedValueOnce({
      current: { availablePackages: packages },
    });

    const result = await getOfferings();

    expect(result).toHaveLength(2);
    expect(result[0].identifier).toBe('monthly');
  });

  it('returns empty array when no current offering', async () => {
    mockGetOfferings.mockResolvedValueOnce({
      current: null,
    });

    const result = await getOfferings();

    expect(result).toEqual([]);
  });

  it('returns empty array when getOfferings throws', async () => {
    mockGetOfferings.mockRejectedValueOnce(new Error('fail'));

    const result = await getOfferings();

    expect(result).toEqual([]);
  });
});

describe('purchasePackage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns customerInfo on successful purchase', async () => {
    const customerInfo = makeCustomerInfo({ pro: { isActive: true } });
    mockPurchasePackage.mockResolvedValueOnce({ customerInfo });

    const result = await purchasePackage(makePackage() as any);

    expect(result).toEqual(customerInfo);
  });

  it('returns null when user cancels', async () => {
    const cancelError = { code: 'PURCHASE_CANCELLED_ERROR' };
    mockPurchasePackage.mockRejectedValueOnce(cancelError);

    const result = await purchasePackage(makePackage() as any);

    expect(result).toBeNull();
  });

  it('throws on non-cancel errors', async () => {
    const otherError = { code: 'STORE_PROBLEM', message: 'Store error' };
    mockPurchasePackage.mockRejectedValueOnce(otherError);

    await expect(purchasePackage(makePackage() as any)).rejects.toEqual(otherError);
  });
});

describe('restorePurchases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns customerInfo on success', async () => {
    const customerInfo = makeCustomerInfo({ pro: { isActive: true } });
    mockRestorePurchases.mockResolvedValueOnce(customerInfo);

    const result = await restorePurchases();

    expect(result).toEqual(customerInfo);
  });

  it('returns null on failure', async () => {
    mockRestorePurchases.mockRejectedValueOnce(new Error('fail'));

    const result = await restorePurchases();

    expect(result).toBeNull();
  });
});
