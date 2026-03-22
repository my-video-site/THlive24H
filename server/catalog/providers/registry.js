const { DemoProvider } = require('./demoProvider');
const { PythonProvider } = require('./pythonProvider');

const providers = new Map();

function registerProvider(provider) {
  providers.set(provider.name, provider);
}

function getProvider(name) {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown provider "${name}".`);
  }
  return provider;
}

function listProviders() {
  return [...providers.values()].map((provider) => ({
    name: provider.name
  }));
}

registerProvider(new DemoProvider());
registerProvider(new PythonProvider());

module.exports = {
  getProvider,
  listProviders,
  registerProvider
};
