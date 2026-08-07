import type React from "react";
import {
  Add,
  Apps,
  CloudOffline,
  CloudUpload,
  Desktop,
  DocumentAttach,
  Grid,
  LogOut as IonLogOut,
  Moon as IonMoon,
  Options,
  People,
  Search as IonSearch,
  School,
  Sunny,
  Warning,
} from "react-ionicons";

interface IconProps {
  className?: string;
}

function wrap(Ion: (props: Record<string, unknown>) => React.JSX.Element) {
  return function Icon({ className }: IconProps) {
    return <Ion color="currentColor" cssClasses={className} />;
  };
}

export const CloudOff = wrap(CloudOffline);
export const LayoutDashboard = wrap(Grid);
export const LogOut = wrap(IonLogOut);
export const Moon = wrap(IonMoon);
export const Sun = wrap(Sunny);
export const Users = wrap(People);
export const GraduationCap = wrap(School);
export const AlertTriangle = wrap(Warning);
export const FileUp = wrap(DocumentAttach);
export const Search = wrap(IonSearch);
export const SlidersHorizontal = wrap(Options);
export const Plus = wrap(Add);
export const Upload = wrap(CloudUpload);
export const Monitor = wrap(Desktop);
export const AppsIcon = wrap(Apps);
