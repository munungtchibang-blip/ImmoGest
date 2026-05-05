# Security Spec for Property Management

## Data Invariants
1. A property requires a valid landlordId that belongs to the user.
2. A tenant must belong to a landlord.
3. Payments must be linked to an existing tenant and landlord.
4. Maintenance issues must be linked to a tenant and landlord.
5. Expenses must be linked to a landlord.
6. Contracts must be linked to a tenant, property, and landlord.

## The "Dirty Dozen" Payloads
1. Attempting to create a tenant with landlordId differing from request.auth.uid
2. Attempting to update a property's landlordId
3. Attempting to send a payload with a "Ghost Field" (e.g. `isAdmin: true` on Tenant)
4. Attempting to spoof email verification for list query
5. Attempting to get a tenant profile as an unauthenticated user or wrong landlord
6. Blank reads of tenants collection `allow list: if isSignedIn()`
7. Array size expansion attack (though no arrays exist here currently)
8. Setting `amount` in payments to a string instead of number
9. Missing required field on create (e.g., leaving out `createdAt`)
10. Spoofed client timestamp instead of server time (using string instead of checking `request.time` locally, wait, testing local mock)
11. Bypassing state lock (e.g., trying to change maintenance after 'Résolu')
12. Attempting to read expenses by non-owning landlord

## Test Runner
The firestore.rules.test.ts file will instantiate these payloads against the emulator to ensure PERMISSION_DENIED.
