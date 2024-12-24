// noinspection JSUnusedGlobalSymbols
/**
 *
 */
export class Constant {
  static rootPath = new Constant('Root', 'Root URL path.', '/');
  static homePath = new Constant('Home', 'Home URL path.', '/home');
  static signInPath = new Constant('Sign In', 'Sign in URL path.', '/signIn');
  static balancesPath = new Constant(
    'Balances',
    'Balances URL path.',
    '/balances',
  );
  static marketsPath = new Constant('Markets', 'Markets URL path.', '/markets');
  static marketPath = new Constant('Market', 'Market URL path.', '/market');
  static ordersPath = new Constant('Orders', 'Orders URL path.', '/orders');
  static orderPath = new Constant('Order', 'Order URL path.', '/order');
  static createOrderPath = new Constant(
    'Create Order',
    'Create Order URL path.',
    '/order/create',
  );
  static rewardsPath = new Constant('Rewards', 'Rewards URL path.', '/rewards');
  static developmentPath = new Constant(
    'Development',
    'Development URL path.',
    '/development',
  );

  static v1Path = new Constant('V1 Root', 'V1 Root URL path.', '/v1');
  static v1HomePath = new Constant('Home', 'V1 Home URL path.', '/v1/home');
  static v1SignInPath = new Constant(
    'Sign In',
    'V1 Sign in URL path.',
    '/v1/signIn',
  );
  static v1BalancesPath = new Constant(
    'Balances',
    'V1 Balances URL path.',
    '/v1/balances',
  );
  static v1MarketsPath = new Constant(
    'Markets',
    'V1 Markets URL path.',
    '/v1/markets',
  );
  static v1MarketPath = new Constant(
    'Market',
    'V1 Market URL path.',
    '/v1/market',
  );
  static v1OrdersPath = new Constant(
    'Orders',
    'V1 Orders URL path.',
    '/v1/orders',
  );
  static v1OrderPath = new Constant('Order', 'V1 Order URL path.', '/v1/order');
  static v1CreateOrderPath = new Constant(
    'Create Order',
    'V1 Create Order URL path.',
    '/v1/order/create',
  );
  static v1RewardsPath = new Constant(
    'Rewards',
    'V1 Rewards URL path.',
    '/v1/rewards',
  );
  static v1DevelopmentPath = new Constant(
    'Development',
    'V1 Development URL path.',
    '/v1/development',
  );

  static v2Path = new Constant('V2 Root', 'V2 Root URL path.', '/v2');
  static v2HomePath = new Constant('Home', 'V2 Home URL path.', '/v2/home');
  static v2SignInPath = new Constant(
    'Sign In',
    'V2 Sign in URL path.',
    '/v2/signIn',
  );
  static v2BalancesPath = new Constant(
    'Balances',
    'V2 Balances URL path.',
    '/v2/balances',
  );
  static v2MarketsPath = new Constant(
    'Markets',
    'V2 Markets URL path.',
    '/v2/markets',
  );
  static v2MarketPath = new Constant(
    'Market',
    'V2 Market URL path.',
    '/v2/market',
  );
  static v2OrdersPath = new Constant(
    'Orders',
    'V2 Orders URL path.',
    '/v2/orders',
  );
  static v2OrderPath = new Constant('Order', 'V2 Order URL path.', '/v2/order');
  static v2CreateOrderPath = new Constant(
    'Create Order',
    'V2 Create Order URL path.',
    '/v2/order/create',
  );
  static v2RewardsPath = new Constant(
    'Rewards',
    'V2 Rewards URL path.',
    '/v2/rewards',
  );
  static v2DevelopmentPath = new Constant(
    'Development',
    'V2 Development URL path.',
    '/v2/development',
  );

  static currentRoutePath = Constant.v2Path;

  static defaultTimeout = new Constant(
    'Default Timeout',
    'Default timeout.',
    60,
  );
  static defaultMaxNumberOfRetries = new Constant(
    'Default Max Number of Retries',
    'Default max number of retries.',
    3,
  );
  static defaultDelayDelayBetweenRetries = new Constant(
    'Default Delay Between Retries',
    'Default delay between retries.',
    5,
  );
  static defaultBatchSize = new Constant(
    'Default Batch Size',
    'Default batch size.',
    100,
  );
  static defaultDelayBetweenBatches = new Constant(
    'Default Delay Between Batches',
    'Default delay between batches.',
    5,
  );

  static productionEnvironment = new Constant(
    'Production Environment',
    'Production environment.',
    'production',
  );
  static stagingEnvironment = new Constant(
    'Staging Environment',
    'Staging environment.',
    'staging',
  );
  static developmentEnvironment = new Constant(
    'Development Environment',
    'Development environment.',
    'development',
  );
  static productionUSDCurrency = new Constant(
    'Production USD Currency',
    'Production USD currency.',
    'USDC',
  );
  static stagingUSDCurrency = new Constant(
    'Staging USD Currency',
    'Staging USD currency.',
    'tUSDC',
  );
  static developmentUSDCurrency = Constant.stagingUSDCurrency;

  static usdCurrencies = new Constant('USD Currencies', 'USD currencies.', [
    'USDC',
    'USDT',
    'TUSDC',
    'TUSDT',
  ]);

  title: string;

  description: string;

  value: any;

  /**
   *
   * @param title
   * @param description
   * @param value
   */
  constructor(title: string, description: string, value: any) {
    this.title = title;
    this.description = description;
    this.value = value;
  }

  getValueAs<T>(): T {
    return this.value as T;
  }
}
