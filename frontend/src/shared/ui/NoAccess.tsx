import { Link } from "react-router-dom";
import { Card, CardBody } from "./Card";
import { LockIcon } from "./icons";

// بتتعرض بدل الصفحة لما المستخدم يفتح رابط أدواره مش بتسمح بيه (الباك برضه بيرفض الطلبات بـ403).
export function NoAccess() {
  return (
    <Card className="mx-auto mt-10 max-w-md text-center">
      <CardBody className="py-10">
        <LockIcon className="mx-auto mb-4 h-10 w-10 text-slate-300" />
        <h1 className="text-lg font-bold text-slate-900">معندكش صلاحية تفتح الصفحة دي</h1>
        <p className="mt-2 text-sm text-slate-500">لو محتاجها، اطلب الصلاحية من المدير</p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
          الرجوع للرئيسية
        </Link>
      </CardBody>
    </Card>
  );
}

export function NotFound() {
  return (
    <Card className="mx-auto mt-10 max-w-md text-center">
      <CardBody className="py-10">
        <p className="text-4xl font-black text-slate-300">404</p>
        <h1 className="mt-2 text-lg font-bold text-slate-900">الصفحة دي مش موجودة</h1>
        <p className="mt-2 text-sm text-slate-500">اتأكد من الرابط، أو ارجع للرئيسية</p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
          الرجوع للرئيسية
        </Link>
      </CardBody>
    </Card>
  );
}
