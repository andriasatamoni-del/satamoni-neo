import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      {...props}
    />
  );
}

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L22.28 12M4.5 9.75V21a.75.75 0 00.75.75H9a.75.75 0 00.75-.75v-4.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21a.75.75 0 00.75.75h3.75a.75.75 0 00.75-.75V9.75" />
  </Icon>
);
export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </Icon>
);
export const BuildingIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
  </Icon>
);
export const BoxIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
  </Icon>
);
export const BookIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </Icon>
);
export const TruckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v11.177m0-11.177L12 4.5m2.25 3.073L18.75 4.5" />
  </Icon>
);
export const CartIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
  </Icon>
);
export const CoinsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 7.756a4.5 4.5 0 100 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </Icon>
);
export const CardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
  </Icon>
);
export const IdCardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 6v12a1.5 1.5 0 001.5 1.5zm6.75-10.125a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0zM4.5 19.5a5.973 5.973 0 011.75-4.225 5.973 5.973 0 014.225-1.75 5.973 5.973 0 014.225 1.75A5.973 5.973 0 0117 19.5" />
  </Icon>
);
export const ClipboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4.5h6M8.25 21h7.5a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.223 4.01 8.378 4.973 8.378 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9v.75z" />
  </Icon>
);
export const PrinterIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
  </Icon>
);

export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
  </Icon>
);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
  </Icon>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </Icon>
);
export const FireIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
  </Icon>
);
export const ShieldUserIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.286z" />
  </Icon>
);
export const VaultIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0116.5 0m-16.5 0V6.375c0-1.036.84-1.875 1.875-1.875h12.75c1.036 0 1.875.84 1.875 1.875v12.375m-16.5 0h16.5M4.5 6h.75M4.5 9h.75m-.75 3h.75M4.5 15h.75M15 6h.75M15 9h.75M15 12h.75M15 15h.75M9.75 6h1.5v9h-1.5V6z" />
  </Icon>
);
export const UserCircleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
  </Icon>
);
export const ListSearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h9.75m-9.75 5.25h4.5m9-1.5l3 3m-.75-6a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
  </Icon>
);
export const FactoryIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M4.5 21V9.75l6-3.375v3.375l6-3.375v3.375l3-1.688V21M9 21v-4.5h3V21" />
  </Icon>
);
export const ChatBubbleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-.653 0-1.297-.027-1.933-.078a2.176 2.176 0 01-.567-.11m6.5-6.362a2.25 2.25 0 00-1.5-2.096 12.2 12.2 0 00-3.5-.5c-1.22 0-2.4.174-3.5.5a2.25 2.25 0 00-1.5 2.096v4.286c0 1.136.847 2.1 1.98 2.193.34.027.68.052 1.02.072M6.75 15.75l-3 3v-3.091a13.44 13.44 0 01-1.02-.072C1.598 15.494.75 14.53.75 13.395V9.109c0-.968.616-1.812 1.5-2.096A12.2 12.2 0 016 6.5c1.363 0 2.673.213 3.897.606" />
  </Icon>
);
