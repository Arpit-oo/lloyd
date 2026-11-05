/** "Acme Robotics", "acme-robotics" and "ACME robotics!" are the same brand name. Shared by server and browser. */
export const brandNameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
