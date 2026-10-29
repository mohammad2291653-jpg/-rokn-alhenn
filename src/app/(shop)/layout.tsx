import { CartProvider } from '@/components/store/cart-context';
import { StoreProvider } from '@/components/store/store-context';
import { Header } from '@/components/store/header';
import { Footer } from '@/components/store/footer';
import { getStoreSettings } from '@/components/store/data';
export const dynamic = 'force-dynamic';
export default async function ShopLayout({ children }: { children: React.ReactNode }) { const settings = await getStoreSettings(); return <StoreProvider whatsapp={settings.whatsapp}><CartProvider><Header logoUrl={settings.logoUrl} /><main id="main-content">{children}</main><Footer instagram={settings.instagram} whatsapp={settings.whatsapp} facebook={settings.facebook} logoUrl={settings.logoUrl} /></CartProvider></StoreProvider>; }
