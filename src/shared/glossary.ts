// docs/06 §6.7 — exact definitions.
export const GLOSSARY: Record<string, string> = {
  Liquidity: 'Money sitting in the trading pool. More liquidity means you can sell without moving the price as much.',
  FDV: 'Fully diluted value: price multiplied by the total supply. It is a headline number, not cash you could take out.',
  'Price impact': 'How much your own trade moves the price. Bigger trades in smaller pools move it more.',
  Slippage: 'The difference between the price you expected and the price you actually got.',
  'Mint authority': 'A key that can create more tokens. If active, the owner can inflate supply at any time.',
  'Freeze authority': 'A key that can freeze token accounts, which can stop holders from selling.',
  'Rug pull': 'When creators drain liquidity or dump their holdings so other holders cannot sell.',
  'Holder concentration': 'How much of the supply sits in a few wallets. High concentration means a few sellers can crash the price.',
  'Early buyers': 'Wallets that bought in the first minutes. Many linked early buyers can mean coordinated activity.',
  Bundle: 'Several buys placed together by related wallets, often to make demand look larger.',
  Completeness: 'How much of the checking the app could actually do. Low completeness means missing data, not good news.',
  'Risk score': "A 0-100 count of warning signs found by the app's rules. It is not a prediction.",
  Gap: 'A time period the app could not watch, so launches may be missing.',
  'Paper trade': 'A pretend trade recorded with simulated costs, used to test ideas without money.',
  Drawdown: 'How far your account has fallen from its highest point.',
};
