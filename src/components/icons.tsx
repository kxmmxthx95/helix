import type React from "react";
// Deep imports — the package barrel pulls every icon into the main chunk.
import Add from "react-ionicons/lib/Add";
import AppsOutline from "react-ionicons/lib/AppsOutline";
import BarChartOutline from "react-ionicons/lib/BarChartOutline";
import BookOutline from "react-ionicons/lib/BookOutline";
import CalendarOutline from "react-ionicons/lib/CalendarOutline";
import Checkbox from "react-ionicons/lib/Checkbox";
import CheckmarkCircleOutline from "react-ionicons/lib/CheckmarkCircleOutline";
import CheckboxOutline from "react-ionicons/lib/CheckboxOutline";
import ClipboardOutline from "react-ionicons/lib/ClipboardOutline";
import IonChevronBack from "react-ionicons/lib/ChevronBack";
import IonChevronForward from "react-ionicons/lib/ChevronForward";
import Close from "react-ionicons/lib/Close";
import CloudOffline from "react-ionicons/lib/CloudOffline";
import CloudUpload from "react-ionicons/lib/CloudUpload";
import Desktop from "react-ionicons/lib/Desktop";
import DocumentAttach from "react-ionicons/lib/DocumentAttach";
import DocumentTextOutline from "react-ionicons/lib/DocumentTextOutline";
import Download from "react-ionicons/lib/Download";
import EyeOffOutline from "react-ionicons/lib/EyeOffOutline";
import EyeOutline from "react-ionicons/lib/EyeOutline";
import GridOutline from "react-ionicons/lib/GridOutline";
import HelpCircleOutline from "react-ionicons/lib/HelpCircleOutline";
import Key from "react-ionicons/lib/Key";
import LibraryOutline from "react-ionicons/lib/LibraryOutline";
import IonLogOut from "react-ionicons/lib/LogOut";
import MenuOutline from "react-ionicons/lib/MenuOutline";
import IonMoon from "react-ionicons/lib/Moon";
import Options from "react-ionicons/lib/Options";
import PeopleOutline from "react-ionicons/lib/PeopleOutline";
import PersonAddOutline from "react-ionicons/lib/PersonAddOutline";
import PersonCircleOutline from "react-ionicons/lib/PersonCircleOutline";
import PencilOutline from "react-ionicons/lib/PencilOutline";
import RibbonOutline from "react-ionicons/lib/RibbonOutline";
import IonSearch from "react-ionicons/lib/Search";
import SchoolOutline from "react-ionicons/lib/SchoolOutline";
import IonSettings from "react-ionicons/lib/Settings";
import Sunny from "react-ionicons/lib/Sunny";
import AirplaneOutline from "react-ionicons/lib/AirplaneOutline";
import CalculatorOutline from "react-ionicons/lib/CalculatorOutline";
import ColorWandOutline from "react-ionicons/lib/ColorWandOutline";
import ImageOutline from "react-ionicons/lib/ImageOutline";
import ListOutline from "react-ionicons/lib/ListOutline";
import TimeOutline from "react-ionicons/lib/TimeOutline";
import Warning from "react-ionicons/lib/Warning";
import WatchOutline from "react-ionicons/lib/WatchOutline";

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
export const LayoutDashboard = wrap(GridOutline);
export const LogOut = wrap(IonLogOut);
export const MenuIcon = wrap(MenuOutline);
export const ProfileIcon = wrap(PersonCircleOutline);
export const Moon = wrap(IonMoon);
export const Sun = wrap(Sunny);
export const Users = wrap(PeopleOutline);
export const GraduationCap = wrap(SchoolOutline);
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
export const AppsIcon = wrap(AppsOutline);
export const BarChartIcon = wrap(BarChartOutline);
export const ChevronBack = wrap(IonChevronBack);
export const ChevronForward = wrap(IonChevronForward);
export const SettingsIcon = wrap(IonSettings);
export const BookIcon = wrap(BookOutline);
export const LibraryIcon = wrap(LibraryOutline);
export const PersonAddIcon = wrap(PersonAddOutline);
export const PencilIcon = wrap(PencilOutline);
export const TimeIcon = wrap(TimeOutline);
export const CalendarIcon = wrap(CalendarOutline);
export const WatchIcon = wrap(WatchOutline);
export const AirplaneIcon = wrap(AirplaneOutline);
export const CheckboxIcon = wrap(Checkbox);
export const CheckboxOutlineIcon = wrap(CheckboxOutline);
export const CheckmarkCircleIcon = wrap(CheckmarkCircleOutline);
export const ClipboardIcon = wrap(ClipboardOutline);
export const TimetableIcon = wrap(GridOutline);
export const RibbonIcon = wrap(RibbonOutline);
export const DocumentTextIcon = wrap(DocumentTextOutline);
export const X = wrap(Close);
export const ListIcon = wrap(ListOutline);
export const ImageIcon = wrap(ImageOutline);
export const FormulaIcon = wrap(CalculatorOutline);
export const HighlightIcon = wrap(ColorWandOutline);

/** No ionicons bold/underline glyph exists — plain monoline SVGs matching the wrap()'d icons' size contract instead. */
export function BoldIcon({ className, size }: IconProps) {
  const px = size ?? sizeFromClass(className);
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" strokeLinejoin="round" />
    </svg>
  );
}

export function UnderlineIcon({ className, size }: IconProps) {
  const px = size ?? sizeFromClass(className);
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M6 4v7a6 6 0 0 0 12 0V4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** No ionicons italic glyph exists — plain monoline SVG matching the wrap()'d icons' size contract instead. */
export function ItalicIcon({ className, size }: IconProps) {
  const px = size ?? sizeFromClass(className);
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M10 4h8M6 20h8M14 4 10 20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
