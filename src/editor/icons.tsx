import { icons } from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { IconName } from "../blocks/icon";

export function blockIcon(name: IconName): LucideIcon {
  return icons[name];
}

export function BlockIcon({
  name,
  ...props
}: { readonly name: IconName } & LucideProps) {
  const Icon = blockIcon(name);
  return <Icon {...props} />;
}
