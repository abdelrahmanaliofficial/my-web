<?php

namespace App\Services;

use App\Models\Invoice;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class InvoicePdfService
{
    public function resolveBrandIdentity(): array
    {
        $brand = [
            'brand_name' => (string) config('app.name', 'Abdelrahman Ali'),
            'logo_url' => '',
            'logo_data_uri' => '',
            'primary_color' => '#38bdf8',
            'email' => (string) config('mail.from.address', ''),
        ];

        try {
            if (!Schema::hasTable('settings')) {
                return $brand;
            }

            $rows = DB::table('settings')->get(['key', 'value']);
            foreach ($rows as $row) {
                $key = (string) ($row->key ?? '');
                $rawValue = $row->value ?? null;
                $decoded = is_string($rawValue) ? json_decode($rawValue, true) : $rawValue;

                if (in_array($key, ['brand_name', 'site_name'], true)) {
                    $candidate = is_string($decoded) ? $decoded : (is_string($rawValue) ? $rawValue : '');
                    if (trim($candidate) !== '') {
                        $brand['brand_name'] = trim($candidate);
                    }
                }

                if ($key === 'appearance' && is_array($decoded)) {
                    if (!empty($decoded['logo_url']) && is_string($decoded['logo_url'])) {
                        $brand['logo_url'] = trim($decoded['logo_url']);
                    }
                    if (!empty($decoded['primary_color']) && is_string($decoded['primary_color'])) {
                        $brand['primary_color'] = $decoded['primary_color'];
                    }
                }
            }
        } catch (\Throwable) {
            // Invoice generation remains available with safe application defaults.
        }

        if ($brand['logo_url'] !== '') {
            $brand['logo_data_uri'] = $this->resolvePublicLogoDataUri($brand['logo_url']);
        }

        return $brand;
    }

    /**
     * Embed only an image resolved through the configured public storage disk.
     * The disk driver retrieves the object; this method never fetches arbitrary URLs.
     */
    private function resolvePublicLogoDataUri(string $reference): string
    {
        $diskName = (string) config('filesystems.public_media_disk', 'public');

        try {
            $disk = Storage::disk($diskName);
            $baseUrl = (string) $disk->url('');
            $baseParts = parse_url($baseUrl);
            $referenceParts = parse_url($reference);
            $basePath = rtrim((string) ($baseParts['path'] ?? ''), '/');
            $referencePath = (string) ($referenceParts['path'] ?? $reference);

            // Absolute media URLs must match the configured disk's origin.
            if (!empty($referenceParts['host'])) {
                if (empty($baseParts['host'])) {
                    return '';
                }

                $sameHost = strtolower((string) $referenceParts['host']) === strtolower((string) $baseParts['host']);
                $samePort = (int) ($referenceParts['port'] ?? 0) === (int) ($baseParts['port'] ?? 0);
                $sameScheme = strtolower((string) ($referenceParts['scheme'] ?? '')) === strtolower((string) ($baseParts['scheme'] ?? ''));
                if (!$sameHost || !$samePort || !$sameScheme) {
                    return '';
                }
            }

            $normalizedPath = '/' . ltrim($referencePath, '/');
            if ($basePath !== '' && str_starts_with($normalizedPath, $basePath . '/')) {
                $storagePath = substr($normalizedPath, strlen($basePath) + 1);
            } elseif ($basePath === '' && !empty($referenceParts['host'])) {
                // Root-based S3-compatible public URLs store the object key directly in the URL path.
                $storagePath = ltrim($normalizedPath, '/');
            } elseif (str_starts_with(ltrim($normalizedPath, '/'), 'storage/')) {
                $storagePath = substr(ltrim($normalizedPath, '/'), strlen('storage/'));
            } elseif (str_starts_with(ltrim($normalizedPath, '/'), 'public/')) {
                $storagePath = substr(ltrim($normalizedPath, '/'), strlen('public/'));
            } else {
                return '';
            }

            $storagePath = ltrim($storagePath, '/');
            if ($storagePath === '' || str_contains($storagePath, '..') || str_contains($storagePath, "\\")) {
                return '';
            }

            if (!$disk->exists($storagePath)) {
                return '';
            }

            $mime = strtolower((string) $disk->mimeType($storagePath));
            $allowed = ['image/png', 'image/jpeg', 'image/gif'];
            if (!in_array($mime, $allowed, true)) {
                return '';
            }

            $bytes = $disk->get($storagePath);
            if (!is_string($bytes) || $bytes === '' || strlen($bytes) > 2_000_000) {
                return '';
            }

            return 'data:' . $mime . ';base64,' . base64_encode($bytes);
        } catch (\Throwable) {
            return '';
        }
    }

    public function generatePdfBytes(Invoice $invoice): string
    {
        $invoice->loadMissing(['client', 'project', 'items', 'payments']);
        $brand = $this->resolveBrandIdentity();

        if (class_exists(\Dompdf\Dompdf::class)) {
            $html = $this->renderHtml($invoice, $brand);
            $dompdf = new \Dompdf\Dompdf(['isRemoteEnabled' => false]);
            $dompdf->loadHtml($html, 'UTF-8');
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();
            return (string) $dompdf->output();
        }

        return $this->buildStructuredPdfDocument($invoice, $brand);
    }

    public function downloadResponse(Invoice $invoice): Response
    {
        $pdfBytes = $this->generatePdfBytes($invoice);
        $safeNumber = preg_replace('/[^a-zA-Z0-9_-]/', '-', $invoice->invoice_number) ?: 'invoice';
        $filename = $safeNumber . '.pdf';

        return response($pdfBytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store, max-age=0',
        ]);
    }

    public function renderHtml(Invoice $invoice, array $brand): string
    {
        $brandName = e($brand['brand_name'] ?? 'Abdelrahman Ali');
        $accentColor = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($brand['primary_color'] ?? ''))
            ? $brand['primary_color']
            : '#38bdf8';
        $clientName = e($invoice->client?->full_name ?? 'Client');
        $clientCompany = e($invoice->client?->company_name ?? '');
        $clientEmail = e($invoice->client?->email ?? '');
        $clientAddress = e($invoice->client?->address ?? '');
        $projectLabel = $invoice->project
            ? e($invoice->project->project_code . ' - ' . $invoice->project->name)
            : 'N/A';

        $itemsHtml = '';
        if ($invoice->items->isNotEmpty()) {
            foreach ($invoice->items as $item) {
                $itemsHtml .= '<tr>'
                    . '<td>' . e($item->description) . '</td>'
                    . '<td>' . number_format((float) $item->quantity, 2) . '</td>'
                    . '<td>' . number_format((float) $item->unit_price, 2) . ' ' . e($invoice->currency) . '</td>'
                    . '<td>' . number_format((float) $item->line_total, 2) . ' ' . e($invoice->currency) . '</td>'
                    . '</tr>';
            }
        } else {
            $itemsHtml = '<tr>'
                . '<td>' . e($invoice->description ?: 'Professional Services') . '</td>'
                . '<td>1.00</td>'
                . '<td>' . number_format((float) $invoice->amount, 2) . ' ' . e($invoice->currency) . '</td>'
                . '<td>' . number_format((float) $invoice->amount, 2) . ' ' . e($invoice->currency) . '</td>'
                . '</tr>';
        }

        $paymentsHtml = '';
        foreach ($invoice->payments as $payment) {
            $paymentsHtml .= '<tr>'
                . '<td>' . e($payment->payment_reference) . '</td>'
                . '<td>' . e($payment->paid_at?->toDateString() ?? '') . '</td>'
                . '<td>' . e($payment->payment_method) . '</td>'
                . '<td>' . number_format((float) $payment->amount, 2) . ' ' . e($payment->currency) . '</td>'
                . '</tr>';
        }

        $logoMarkup = '';
        $logoDataUri = (string) ($brand['logo_data_uri'] ?? '');
        if (str_starts_with($logoDataUri, 'data:image/')) {
            $logoMarkup = '<img class="brand-logo" src="' . e($logoDataUri) . '" alt="Brand logo">';
        }
        $brandEmail = trim((string) ($brand['email'] ?? ''));
        $brandEmailMarkup = $brandEmail !== '' ? '<span>' . e($brandEmail) . '</span>' : '';

        return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
            . 'body{font-family:DejaVu Sans,sans-serif;color:#0f172a;font-size:12px;}'
            . '.header{border-bottom:3px solid ' . $accentColor . ';padding-bottom:12px;margin-bottom:20px;}'
            . '.brand-row{display:block;margin-bottom:8px;}'
            . '.brand-logo{max-width:150px;max-height:64px;object-fit:contain;display:block;margin:0 0 8px;}'
            . '.brand-contact{font-size:10px;color:#475569;margin:2px 0 8px;}'
            . 'table{width:100%;border-collapse:collapse;margin-top:14px;}'
            . 'th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;}'
            . 'th{background:#f1f5f9;}'
            . '</style></head><body>'
            . '<div class="header"><div class="brand-row">' . $logoMarkup . '<h1>' . $brandName . '</h1></div>'
            . '<div class="brand-contact">' . $brandEmailMarkup . '</div>'
            . '<p><strong>Invoice:</strong> ' . e($invoice->invoice_number)
            . ' | <strong>Status:</strong> ' . e(strtoupper($invoice->status)) . '</p></div>'
            . '<p><strong>Bill To:</strong> ' . $clientName . ($clientCompany ? ' (' . $clientCompany . ')' : '') . '<br>'
            . ($clientEmail ? $clientEmail . '<br>' : '')
            . ($clientAddress ? $clientAddress . '<br>' : '')
            . '<strong>Project:</strong> ' . $projectLabel . '<br>'
            . '<strong>Issue Date:</strong> ' . e($invoice->issue_date?->toDateString() ?? '—')
            . ' | <strong>Due Date:</strong> ' . e($invoice->due_date?->toDateString() ?? '—') . '</p>'
            . '<table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>'
            . '<tbody>' . $itemsHtml . '</tbody></table>'
            . '<p><strong>Total:</strong> ' . number_format((float) $invoice->amount, 2) . ' ' . e($invoice->currency) . '<br>'
            . '<strong>Paid:</strong> ' . number_format((float) $invoice->paid_amount, 2) . ' ' . e($invoice->currency) . '<br>'
            . '<strong>Balance Due:</strong> ' . number_format((float) $invoice->balance_due, 2) . ' ' . e($invoice->currency) . '</p>'
            . ($paymentsHtml !== ''
                ? '<h3>Recorded Payments</h3><table><thead><tr><th>Reference</th><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>' . $paymentsHtml . '</tbody></table>'
                : '')
            . '</body></html>';
    }

    /**
     * Generates a standards-compliant PDF 1.4 binary directly from verified database fields
     * without requiring external PDF extension dependencies.
     */
    private function buildStructuredPdfDocument(Invoice $invoice, array $brand): string
    {
        $lines = [
            $brand['brand_name'] . ' — INVOICE',
            'Invoice Number: ' . $invoice->invoice_number,
            'Status: ' . strtoupper($invoice->status),
            'Issue Date: ' . ($invoice->issue_date?->toDateString() ?? '—') . '   Due Date: ' . ($invoice->due_date?->toDateString() ?? '—'),
            'Bill To: ' . ($invoice->client?->full_name ?? 'Client')
                . ($invoice->client?->company_name ? ' (' . $invoice->client->company_name . ')' : ''),
            'Client Email: ' . ($invoice->client?->email ?? '—'),
            'Project: ' . ($invoice->project ? $invoice->project->project_code . ' - ' . $invoice->project->name : 'N/A'),
            'Description: ' . ($invoice->description ?: 'Professional Services'),
            '----------------------------------------------------------------',
            'LINE ITEMS:',
        ];

        if ($invoice->items->isNotEmpty()) {
            foreach ($invoice->items as $idx => $item) {
                $lines[] = sprintf(
                    '%d. %s | Qty: %s x %s = %s %s',
                    $idx + 1,
                    $item->description,
                    number_format((float) $item->quantity, 2),
                    number_format((float) $item->unit_price, 2),
                    number_format((float) $item->line_total, 2),
                    $invoice->currency
                );
            }
        } else {
            $lines[] = sprintf(
                '1. %s = %s %s',
                $invoice->description ?: 'Invoice Total',
                number_format((float) $invoice->amount, 2),
                $invoice->currency
            );
        }

        $lines[] = '----------------------------------------------------------------';
        $lines[] = 'Total Amount: ' . number_format((float) $invoice->amount, 2) . ' ' . $invoice->currency;
        $lines[] = 'Paid Amount:  ' . number_format((float) $invoice->paid_amount, 2) . ' ' . $invoice->currency;
        $lines[] = 'Balance Due:  ' . number_format((float) $invoice->balance_due, 2) . ' ' . $invoice->currency;

        if ($invoice->payments->isNotEmpty()) {
            $lines[] = '----------------------------------------------------------------';
            $lines[] = 'PAYMENT HISTORY:';
            foreach ($invoice->payments as $payment) {
                $lines[] = sprintf(
                    '- %s | %s | %s | %s %s',
                    $payment->payment_reference,
                    $payment->paid_at?->toDateString() ?? '',
                    $payment->payment_method,
                    number_format((float) $payment->amount, 2),
                    $payment->currency
                );
            }
        }

        $stream = "BT\n/F1 11 Tf\n48 770 Td\n15 TL\n";
        foreach ($lines as $i => $line) {
            $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], substr($line, 0, 110));
            $stream .= ($i === 0 ? "({$escaped}) Tj\n" : "T* ({$escaped}) Tj\n");
        }
        $stream .= "ET";

        $objects = [
            1 => "<< /Type /Catalog /Pages 2 0 R >>",
            2 => "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            3 => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            4 => "<< /Length " . strlen($stream) . " >>\nstream\n{$stream}\nendstream",
            5 => "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $num => $body) {
            $offsets[$num] = strlen($pdf);
            $pdf .= "{$num} 0 obj\n{$body}\nendobj\n";
        }

        $xrefOffset = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xrefOffset}\n%%EOF";

        return $pdf;
    }
}
