# Release Process

This document describes the production release process for MIK-NG.

## Overview

Production deployments are based on **Git tags** using semantic versioning. Tags represent immutable releases that are automatically deployed to production after manual approval.

## Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** version (X.0.0): Incompatible API changes
- **MINOR** version (0.X.0): New functionality in a backward-compatible manner
- **PATCH** version (0.0.X): Backward-compatible bug fixes

## Creating a Release

### Prerequisites

1. Ensure all changes are merged to the `main` branch
2. All tests pass in CI
3. Code has been reviewed and approved
4. You have permission to create releases

### Step 1: Update Version

From the repository root, run one of the following commands depending on the type of release:

```bash
# For a patch release (bug fixes)
pnpm version:patch

# For a minor release (new features, backward compatible)
pnpm version:minor

# For a major release (breaking changes)
pnpm version:major
```

This will:

- Update the version in `package.json`
- Create a git commit with the version change
- Create a git tag with the format `vX.Y.Z`

### Step 2: Push the Tag

Push the tag to GitHub to trigger the deployment:

```bash
git push origin vX.Y.Z
```

Or push all tags:

```bash
git push --tags
```

### Step 3: Manual Approval

1. The workflow will start automatically when the tag is pushed
2. Navigate to the **Actions** tab in GitHub
3. Find the "Production Deployment to DO" workflow run
4. The deployment will pause at the **production** environment
5. A reviewer with approval rights must review and approve the deployment
6. Click **Review deployments** → Select **production** → Click **Approve and deploy**

### Step 4: Deployment

After approval:

- The workflow will continue automatically
- Docker images will be built and tagged with the version
- Database migrations will run (if needed)
- The application will be deployed to Digital Ocean
- A GitHub Release will be created automatically with deployment details

## Tag Format Enforcement

Tags **must** follow the semantic versioning format: `vX.Y.Z`

Examples of valid tags:

- `v1.0.0`
- `v2.1.3`
- `v10.5.2`

Invalid tags will be rejected:

- `1.0.0` (missing 'v' prefix)
- `v1.0` (missing patch version)
- `v1.0.0-beta` (pre-release suffixes not supported)
- `release-1.0.0` (wrong format)

## Branch Protection

The `main` branch (or your primary development branch) should be protected with the following rules:

1. **Require pull request reviews**: At least 1 approval required
2. **Require status checks to pass**: All CI checks must pass
3. **Require branches to be up to date**: Branch must be current before merging
4. **No direct pushes**: All changes must go through pull requests
5. **Require linear history**: No merge commits allowed (optional)

> **Note**: Branch protection rules must be configured by a repository administrator in GitHub Settings → Branches.
> See [BRANCH_PROTECTION_SETUP.md](./.github/BRANCH_PROTECTION_SETUP.md) for detailed setup instructions.
>
> **Legacy Note**: If you still use a `prod` branch for deployments, apply the same protection rules to it.

## Environment Configuration

The production deployment uses GitHub Environments with the following settings:

- **Environment name**: `production`
- **Required reviewers**: Configured team members who can approve deployments
- **Wait timer**: Optional delay before deployment (recommended: 0 minutes)
- **Deployment branches**: Only tags matching `v*.*.*` pattern

## Rollback Procedure

If a release needs to be rolled back:

1. Identify the last known good version tag (e.g., `v1.2.0`)
2. Create a new tag for the rollback: `git tag v1.2.1 <commit-sha-of-v1.2.0>`
3. Push the tag: `git push origin v1.2.1`
4. Follow the normal approval and deployment process

Alternatively, redeploy a previous release:

1. Delete the problematic release tag locally: `git tag -d vX.Y.Z`
2. Delete it remotely: `git push origin :refs/tags/vX.Y.Z`
3. Create a hotfix and follow the normal release process

## Best Practices

1. **Always test in the TEST environment first**: Deploy to test branch before creating production tags
2. **Use descriptive commit messages**: They will appear in the release notes
3. **Tag from main branch**: Ensure you're tagging the correct branch
4. **Coordinate with the team**: Announce releases in team channels
5. **Monitor after deployment**: Watch logs and metrics after production deployment
6. **Keep releases small**: Smaller, frequent releases are easier to manage and rollback

## Troubleshooting

### Tag already exists

If you accidentally create a tag with the wrong commit:

```bash
# Delete local tag
git tag -d vX.Y.Z

# Delete remote tag
git push origin :refs/tags/vX.Y.Z

# Create new tag at correct commit
git tag vX.Y.Z <commit-sha>
git push origin vX.Y.Z
```

### Deployment fails

1. Check the workflow logs in GitHub Actions
2. Verify all secrets and variables are configured correctly
3. Check Digital Ocean console for infrastructure issues
4. If needed, rollback to the previous version

### Approval is stuck

1. Ensure the reviewer has the correct permissions
2. Check that the `production` environment is configured with required reviewers
3. Repository admins can bypass protection rules if necessary

## Contact

For questions or issues with the release process, contact the development team lead or DevOps team.
