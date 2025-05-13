export const config = {
    branches: ['main'],
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        ["@semantic-release/git", {
            "assets": ["dist/*.js", "dist/*.js.map", "dist/*.ts", "dist/*.ts.map"],
            "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
        }],
        '@semantic-release/github'
    ]
};