import type React from "react";
// Deep imports — the package barrel pulls every icon into the main chunk.
import Add from "react-ionicons/lib/Add";
import Apps from "react-ionicons/lib/Apps";
import BarChartOutline from "react-ionicons/lib/BarChartOutline";
import Book from "react-ionicons/lib/Book";
import CalendarOutline from "react-ionicons/lib/CalendarOutline";
import Checkbox from "react-ionicons/lib/Checkbox";
import CheckboxOutline from "react-ionicons/lib/CheckboxOutline";
import ClipboardOutline from "react-ionicons/lib/ClipboardOutline";
import IonChevronBack from "react-ionicons/lib/ChevronBack";
import IonChevronForward from "react-ionicons/lib/ChevronForward";
import Close from "react-ionicons/lib/Close";
import CloudOffline from "react-ionicons/lib/CloudOffline";
import CloudUpload from "react-ionicons/lib/CloudUpload";
import Desktop from "react-ionicons/lib/Desktop";
import DocumentAttach from "react-ionicons/lib/DocumentAttach";
import Download from "react-ionicons/lib/Download";
import EyeOffOutline from "react-ionicons/lib/EyeOffOutline";
import EyeOutline from "react-ionicons/lib/EyeOutline";
import Grid from "react-ionicons/lib/Grid";
import GridOutline from "react-ionicons/lib/GridOutline";
import HelpCircleOutline from "react-ionicons/lib/HelpCircleOutline";
import Key from "react-ionicons/lib/Key";
import Library from "react-ionicons/lib/Library";
import IonLogOut from "react-ionicons/lib/LogOut";
import IonMoon from "react-ionicons/lib/Moon";
import Options from "react-ionicons/lib/Options";
import People from "react-ionicons/lib/People";
import PersonAdd from "react-ionicons/lib/PersonAdd";
import IonSearch from "react-ionicons/lib/Search";
import School from "react-ionicons/lib/School";
import IonSettings from "react-ionicons/lib/Settings";
import Sunny from "react-ionicons/lib/Sunny";
import IonTime from "react-ionicons/lib/Time";
import Warning from "react-ionicons/lib/Warning";

interface IconProps {
  className?: string;
  /** Pixel size — overrides Tailwind h-* when set. Default 16. */
  size?: number;
}

/** Map Tailwind `h-*` (spacing scale) to px for ionicons width/height props. */
function sizeFromClass(className?: string): number {
  if (!className) return 12;
  const match = className.match(/(?:^|\s)h-(\d+(?:\.\d+)?)(?:\s|$)/);
  if (!match?.[1]) return 12;
  return Math.round(Number.parseFloat(match[1]) * 4);
}

function wrap(Ion: (props: Record<string, unknown>) => React.JSX.Element) {
  return function Icon({ className, size }: IconProps) {
    const px = size ?? sizeFromClass(className);
    return (
      <Ion
        color="currentColor"
        width={`${px}px`}
        height={`${px}px`}
        cssClasses={className}
      />
    );
  };
}

export const CloudOff = wrap(CloudOffline);
export const LayoutDashboard = wrap(Grid);
export const LogOut = wrap(IonLogOut);
export const Moon = wrap(IonMoon);
export const Sun = wrap(Sunny);
export const Users = wrap(People);
export const GraduationCap = wrap(School);
export const HelpCircleIcon = wrap(HelpCircleOutline);
export const AlertTriangle = wrap(Warning);
export const FileUp = wrap(DocumentAttach);
export const DownloadIcon = wrap(Download);
export const EyeIcon = wrap(EyeOutline);
export const EyeOffIcon = wrap(EyeOffOutline);
export const KeyIcon = wrap(Key);
export const Search = wrap(IonSearch);
export const SlidersHorizontal = wrap(Options);
export const Plus = wrap(Add);
export const Upload = wrap(CloudUpload);
export const Monitor = wrap(Desktop);
export const AppsIcon = wrap(Apps);
export const BarChartIcon = wrap(BarChartOutline);
export const ChevronBack = wrap(IonChevronBack);
export const ChevronForward = wrap(IonChevronForward);
export const SettingsIcon = wrap(IonSettings);
export const BookIcon = wrap(Book);
export const LibraryIcon = wrap(Library);
export const PersonAddIcon = wrap(PersonAdd);
export const TimeIcon = wrap(IonTime);
export const CalendarIcon = wrap(CalendarOutline);
export const CheckboxIcon = wrap(Checkbox);
export const CheckboxOutlineIcon = wrap(CheckboxOutline);
export const ClipboardIcon = wrap(ClipboardOutline);
export const TimetableIcon = wrap(GridOutline);
export const X = wrap(Close);
