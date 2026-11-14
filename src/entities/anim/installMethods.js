/**
 * M1.3a: put the members of carrier classes onto a class's prototype, descriptors and all (getters stay
 * getters). A name the target already has is an error, never an override.
 */
export function installMethods(target, ...carriers) {
  const proto = target.prototype;
  for (const carrier of carriers) {
    for (const name of Object.getOwnPropertyNames(carrier.prototype)) {
      if (name === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(proto, name)) {
        throw new Error(`installMethods: ${target.name}.${name} is defined twice (${carrier.name})`);
      }
      Object.defineProperty(proto, name, Object.getOwnPropertyDescriptor(carrier.prototype, name));
    }
  }
}
