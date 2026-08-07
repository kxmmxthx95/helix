import {
  cloudOffline,
  grid,
  logOut,
  moon,
  sunny,
  people,
  school,
  alert,
  document,
  search,
  settings,
  add,
  cloudUpload,
} from "ionicons/icons";

interface IconProps {
  className?: string;
}

const SVG = ({ icon, className }: { icon: string; className?: string }) => (
  <svg
    className={className}
    fill="currentColor"
    viewBox="0 0 512 512"
    dangerouslySetInnerHTML={{ __html: icon }}
  />
);

export function CloudOff(props: IconProps) {
  return <SVG icon={cloudOffline} className={props.className} />;
}

export function LayoutDashboard(props: IconProps) {
  return <SVG icon={grid} className={props.className} />;
}

export function LogOut(props: IconProps) {
  return <SVG icon={logOut} className={props.className} />;
}

export function Moon(props: IconProps) {
  return <SVG icon={moon} className={props.className} />;
}

export function Sun(props: IconProps) {
  return <SVG icon={sunny} className={props.className} />;
}

export function Users(props: IconProps) {
  return <SVG icon={people} className={props.className} />;
}

export function GraduationCap(props: IconProps) {
  return <SVG icon={school} className={props.className} />;
}

export function AlertTriangle(props: IconProps) {
  return <SVG icon={alert} className={props.className} />;
}

export function FileUp(props: IconProps) {
  return <SVG icon={document} className={props.className} />;
}

export function Search(props: IconProps) {
  return <SVG icon={search} className={props.className} />;
}

export function SlidersHorizontal(props: IconProps) {
  return <SVG icon={settings} className={props.className} />;
}

export function Plus(props: IconProps) {
  return <SVG icon={add} className={props.className} />;
}

export function Upload(props: IconProps) {
  return <SVG icon={cloudUpload} className={props.className} />;
}
