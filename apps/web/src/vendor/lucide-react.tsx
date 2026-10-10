// Minimal `lucide-react` surface for the vendored shadcn components. The glyphs are Lucide's own SVGs as
// shipped in react-icons/lu (same paths, ISC licence); swap for the lucide-react package when installable.
import type { ComponentType, SVGProps } from 'react';
import type { IconBaseProps } from 'react-icons';
import { LuX, LuLoader, LuCheck, LuChevronDown, LuChevronRight, LuChevronUp, LuCircle, LuSearch } from 'react-icons/lu';
type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
const wrap = (Icon: ComponentType<IconBaseProps>): LucideIcon => (props) => <Icon {...(props as unknown as IconBaseProps)} />;
export const XIcon = wrap(LuX), Loader2Icon = wrap(LuLoader), CheckIcon = wrap(LuCheck), ChevronDownIcon = wrap(LuChevronDown), ChevronRightIcon = wrap(LuChevronRight), ChevronUpIcon = wrap(LuChevronUp), CircleIcon = wrap(LuCircle), SearchIcon = wrap(LuSearch);
