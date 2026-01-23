import QRCodeView from './QRCodeView';

export default async function QRCodePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <QRCodeView id={id} />;
}
