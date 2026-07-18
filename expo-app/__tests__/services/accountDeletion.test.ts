import { isPragasDeletionComplete } from '../../services/accountDeletion';

const complete = {
  ok: true,
  code: 'APP_SCOPED_DATA_DELETED_SHARED_HISTORY_RETAINED',
  appDataDeletionComplete: false,
  appScopedDataDeletionComplete: true,
  pushTokensRevoked: true,
  globalIdentityDeleted: false,
  sharedUnscopedRecordsRetained: ['analytics_events', 'audit_log', 'user_preferences'],
};

describe('account deletion response contract', () => {
  it('accepts required retained records plus future backend additions', () => {
    expect(
      isPragasDeletionComplete({
        ...complete,
        sharedUnscopedRecordsRetained: [
          ...complete.sharedUnscopedRecordsRetained,
          'future_shared_dataset',
        ],
      }),
    ).toBe(true);
  });

  it('rejects partial erasure or missing required retention disclosure', () => {
    expect(isPragasDeletionComplete({ ...complete, pushTokensRevoked: false })).toBe(false);
    expect(
      isPragasDeletionComplete({ ...complete, sharedUnscopedRecordsRetained: ['audit_log'] }),
    ).toBe(false);
  });
});
