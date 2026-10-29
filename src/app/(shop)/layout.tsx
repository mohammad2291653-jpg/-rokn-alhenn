import { CartProvider } from '@/components/store/cart-context';
import { StoreProvider } from '@/components/store/store-context';
import { Header } from '@/components/store/header';
import { Footer } from '@/components/store/footer';
import { getStoreSettings } from '@/components/store/data';
import { requirePreviewReadAccess } from '@/lib/free-preview';
import { FreePreviewBanner } from '@/components/store/free-preview-notice';
import '@/components/store/free-preview.css';
export const dynamic = 'force-dynamic';
export default async function ShopLayout({ children }: { children: React.ReactNode }) { const preview = await requirePreviewReadAccess(); const settings = await getStoreSettings(); return <div className={preview ? 'free-preview-active' : undefined}><StoreProvider whatsapp={settings.whatsapp} readOnly={preview}><CartProvider>{preview && <FreePreviewBanner />}<Header logoUrl={settings.logoUrl} /><main id="main-content">{children}</main><Footer instagram={settings.instagram} whatsapp={settings.whatsapp} facebook={settings.facebook} logoUrl={settings.logoUrl} /></CartProvider></StoreProvider></div>; }
