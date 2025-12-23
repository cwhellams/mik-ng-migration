# GitHub Release-Based Deployment Flow

## Overview

The deployment process now uses GitHub Releases to manage deployments across test and production environments. This provides better tracking, rollback capabilities, and a clear promotion path from test to production.

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Deploy Main to Test                                      │
│     • Manually trigger workflow                              │
│     • Bumps version (patch/minor/major)                      │
│     • Creates GitHub pre-release (test)                      │
│     • Tags code with version                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Deploy to Test Environment (automatic)                   │
│     • Triggered by pre-release creation                      │
│     • Builds & pushes Docker image                           │
│     • Runs database migrations                               │
│     • Updates DigitalOcean app                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Manual validation & testing
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Promote Test to Production                               │
│     • Manually trigger workflow                              │
│     • Select test version to promote                         │
│     • Creates production release (non-prerelease)            │
│     • Copies test release notes                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Production Deployment (automatic)                        │
│     • Triggered by production release                        │
│     • Builds & pushes Docker image                           │
│     • Runs database migrations                               │
│     • Updates production app                                 │
└─────────────────────────────────────────────────────────────┘
```

## Workflows

### 1. Deploy Main to Test (`deploy-main-to-test.yml`)

**Trigger**: Manual workflow dispatch

**Steps**:
1. Select version bump type (patch/minor/major)
2. Bumps version in package.json
3. Creates and pushes git tag to main branch
4. Creates GitHub pre-release (test environment)
5. Triggers test deployment automatically

**Usage**:
```
Actions → Deploy Main to Test → Run workflow
  └─ Select: patch/minor/major
```

### 2. Deploy to Test Environment (`backend-intra-api-docker-build-and-deploy-test.yml`)

**Trigger**: GitHub release published/edited (pre-releases only)

**Steps**:
1. Checks if release is a pre-release (test)
2. Checks out the release tag
3. Determines changed components (backend/SQL)
4. Builds and pushes Docker image with version tag
5. Runs Flyway database migrations if needed
6. Updates DigitalOcean app

**Notes**:
- Only deploys pre-releases (test releases)
- Skips production releases automatically
- Tags Docker images with version number

### 3. Promote Test to Production (`promote-test-to-prod.yml`)

**Trigger**: Manual workflow dispatch

**Steps**:
1. Enter test version tag (e.g., v1.2.3)
2. Validates tag exists and has a test release
3. Creates production release from test version
4. Copies test release notes to production release
5. Triggers production deployment automatically

**Usage**:
```
Actions → Promote Test to Production → Run workflow
  └─ Enter test version: v1.2.3
```

**Validations**:
- Tag must exist
- Tag must have a GitHub release
- Tag must follow semantic versioning (vX.Y.Z)

### 4. Production Deployment (`prod-deploy.yml`)

**Trigger**: 
- Automatic: GitHub production release published/edited (non-prerelease)
- Manual: workflow_dispatch (fallback option)

**Steps**:
1. Checks if release is production (non-prerelease)
2. Checks out the release tag
3. Determines changed components
4. Builds and pushes Docker image with version tag
5. Runs Flyway database migrations if needed
6. Updates production DigitalOcean app

**Manual Override**:
- Still supports manual deployment with version selection
- Includes version safety checks (prevent older versions)
- Requires explicit confirmation for downgrade

## Benefits

### 1. Clear Audit Trail
- Every deployment is tracked as a GitHub release
- Release notes document what's being deployed
- Easy to see what version is in each environment

### 2. Safe Promotion Path
- Test → Production promotion is explicit
- Can't accidentally deploy untested code to production
- Version validation prevents accidental downgrades

### 3. Easy Rollback
- All versions are tagged and tracked
- Can promote any previous test version to production
- Docker images are tagged with versions

### 4. Better Visibility
- GitHub Releases page shows deployment history
- Pre-releases (test) vs releases (production) clearly distinguished
- Release notes carry context from test to production

## Usage Examples

### Example 1: Deploy New Feature to Test

```bash
1. Go to: Actions → Deploy Main to Test
2. Click: Run workflow
3. Select: patch (or minor/major depending on changes)
4. Click: Run workflow
5. Wait: Test deployment runs automatically
6. Check: Release appears in Releases page (pre-release badge)
```

### Example 2: Promote to Production After Testing

```bash
1. Test the application in test environment
2. Go to: Actions → Promote Test to Production
3. Click: Run workflow
4. Enter: v1.2.3 (the test version you want to promote)
5. Click: Run workflow
6. Wait: Production deployment runs automatically
7. Check: Release appears in Releases page (latest release)
```

### Example 3: Emergency Manual Production Deployment

```bash
1. Go to: Actions → Production Deployment to DO
2. Click: Run workflow
3. Enter version tag: v1.2.3
4. Check override if needed: Allow deploying older version
5. Click: Run workflow
```

## Version Numbering Strategy

Follow semantic versioning (semver):

- **Patch** (v1.0.0 → v1.0.1): Bug fixes, minor changes
- **Minor** (v1.0.0 → v1.1.0): New features, backward compatible
- **Major** (v1.0.0 → v2.0.0): Breaking changes

## Safety Features

### Automatic Version Validation
- Production deployment validates version is not older than latest
- Requires explicit override to deploy older versions
- Prevents accidental rollbacks

### Environment Separation
- Pre-releases (test) and releases (production) are distinct
- Workflows automatically filter by release type
- Can't accidentally deploy test release to production

### Release Validation
- Promotes only existing test releases to production
- Validates tag exists and has proper format
- Checks for release existence before promotion

## Migration from Old Flow

### Old Flow (Branch-Based)
```
main branch → push to test branch → test deployment
             → manual prod trigger → production deployment
```

### New Flow (Release-Based)
```
main branch → create test release → test deployment
             → promote to prod release → production deployment
```

### What Changed

1. **No more test branch**: Test deployment triggered by pre-release creation
2. **Explicit versioning**: Every deployment has a version number
3. **Release tracking**: GitHub Releases page shows deployment history
4. **Promotion workflow**: New workflow to promote test to production

### Migration Steps

1. Existing test branch deployments will continue to work (nothing breaks)
2. Start using "Deploy Main to Test" workflow for new deployments
3. Test branch will no longer be updated automatically
4. Can deprecate test branch once confident with new flow

## Troubleshooting

### Issue: Test deployment didn't trigger after creating release
- **Check**: Release must be marked as pre-release
- **Fix**: Edit release and check "Set as a pre-release"

### Issue: Production deployment didn't trigger after promotion
- **Check**: Release must NOT be marked as pre-release
- **Fix**: Should be automatic from promotion workflow

### Issue: Can't promote test version to production
- **Check**: Test release exists for that version
- **Fix**: Deploy to test first using "Deploy Main to Test"

### Issue: Version validation fails in production
- **Check**: Are you trying to deploy an older version?
- **Fix**: Check "Allow deploying older version" or deploy a newer version
