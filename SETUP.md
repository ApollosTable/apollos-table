# Setup

## 1. Install dependencies
```bash
npm install
```

## 2. Environment variables
```bash
cp .env.example .env
# Edit .env with your Anthropic API key and optional email credentials
```

## 3. Facebook cookies (required for scanning)
1. Open Chrome, log into Facebook
2. Install "EditThisCookie" extension (or similar)
3. Go to facebook.com/marketplace
4. Export all cookies — save as `cookies.json` in this directory
5. Verify: file should be a JSON array of cookie objects with `c_user` and `xs` entries

## 4. Run
```bash
node cli.js scan --once    # Test one scan cycle
node cli.js eval           # Evaluate findings
node cli.js deals          # See what's worth grabbing
node cli.js stats          # Summary of what Apollo found
```
