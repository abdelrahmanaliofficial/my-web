<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\User;
use App\Services\PersistentStorageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PersistentMediaStorageTest extends TestCase
{
    use RefreshDatabase;

    public function test_separates_public_assets_and_private_client_files_and_persists_across_restart(): void
    {
        Storage::fake('public');
        Storage::fake('local');

        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create(['email' => 'client@example.com', 'role' => 'client', 'is_active' => true]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Test Client',
            'email' => 'client@example.com',
            'account_status' => 'active',
        ]);
        $project = Project::create([
            'client_id' => $client->id,
            'name' => 'Brand Portal',
            'service_category' => 'Web Architecture',
            'status' => 'in_progress',
        ]);

        // 1. Public asset uploaded to public disk
        $logoFile = UploadedFile::fake()->image('brand-logo.png', 240, 80);
        $publicRes = $this->actingAs($admin)->post('/api/media', [
            'file' => $logoFile,
            'visibility' => 'public',
            'category' => 'site_logo',
        ]);
        $publicRes->assertCreated();
        $publicUid = $publicRes->json('data.file_uid');
        $publicRecord = MediaFile::where('file_uid', $publicUid)->firstOrFail();

        $this->assertSame('public', $publicRecord->disk);
        $this->assertStringStartsWith('public-assets/site_logo/', $publicRecord->storage_path);
        Storage::disk('public')->assertExists($publicRecord->storage_path);
        Storage::disk('local')->assertMissing($publicRecord->storage_path);

        // 2. Private project document uploaded to private local disk
        $pdfPayload = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF";
        $privateDoc = UploadedFile::fake()->createWithContent('nda-contract.pdf', $pdfPayload);
        $privateRes = $this->actingAs($admin)->post('/api/media', [
            'file' => $privateDoc,
            'visibility' => 'private',
            'category' => 'project_document',
            'owner_type' => 'project',
            'owner_id' => $project->id,
        ]);
        $privateRes->assertCreated();
        $privateUid = $privateRes->json('data.file_uid');
        $privateRecord = MediaFile::where('file_uid', $privateUid)->firstOrFail();

        $this->assertSame('local', $privateRecord->disk);
        $this->assertStringStartsWith("private-clients/{$project->id}/project_document/", $privateRecord->storage_path);
        $this->assertStringContainsString("/api/media/{$privateUid}/download", $privateRecord->url);
        $this->assertArrayNotHasKey('disk', $privateRes->json('data'));
        $this->assertArrayNotHasKey('storage_path', $privateRes->json('data'));
        $this->assertArrayNotHasKey('checksum_sha256', $privateRes->json('data'));
        $this->assertArrayNotHasKey('stored_filename', $privateRes->json('data'));
        $this->assertArrayNotHasKey('owner_type', $privateRes->json('data'));
        $this->assertArrayNotHasKey('owner_id', $privateRes->json('data'));
        $this->assertArrayNotHasKey('client_id', $privateRes->json('data'));
        $this->assertArrayNotHasKey('uploaded_by', $privateRes->json('data'));
        Storage::disk('local')->assertExists($privateRecord->storage_path);

        // 3. Re-resolve the service and verify the persisted disk object + database metadata
        app()->forgetInstance(PersistentStorageService::class);
        $reloadedRecord = MediaFile::where('file_uid', $privateUid)->firstOrFail();
        $this->assertSame($pdfPayload, Storage::disk($reloadedRecord->disk)->get($reloadedRecord->storage_path));
        $this->assertSame(hash('sha256', $pdfPayload), $reloadedRecord->checksum_sha256);
    }

    public function test_blocks_executable_uploads_mime_spoofing_and_path_traversal(): void
    {
        Storage::fake('public');
        Storage::fake('local');

        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);

        // Executable PHP payload disguised as PNG double extension
        $phpShell = UploadedFile::fake()->createWithContent('avatar.php.png', '<?php system($_GET["c"]); ?>');
        $this->actingAs($admin)
            ->postJson('/api/media', [
                'file' => $phpShell,
                'visibility' => 'public',
                'category' => 'site_logo',
            ])
            ->assertStatus(422);

        // SVG scriptable vector rejected on upload
        $svgUpload = UploadedFile::fake()->createWithContent('icon.svg', '<svg onload="alert(1)"></svg>');
        $this->actingAs($admin)
            ->postJson('/api/media', [
                'file' => $svgUpload,
                'visibility' => 'public',
                'category' => 'site_logo',
            ])
            ->assertStatus(422);

        // Path traversal filename neutralized / blocked
        $traversal = UploadedFile::fake()->image('../../../../etc/passwd.png', 10, 10);
        $res = $this->actingAs($admin)->post('/api/media', [
            'file' => $traversal,
            'visibility' => 'public',
            'category' => 'site_logo',
        ]);
        if ($res->status() === 201) {
            $storedPath = MediaFile::where('file_uid', $res->json('data.file_uid'))->value('storage_path');
            $this->assertStringNotContainsString('..', $storedPath);
            $this->assertStringStartsWith('public-assets/site_logo/', $storedPath);
        } else {
            $res->assertStatus(422);
        }
    }

    public function test_enforces_client_isolation_signed_downloads_replacement_and_deletion(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);

        $userA = User::factory()->create(['email' => 'a@example.com', 'role' => 'client', 'is_active' => true]);
        $clientA = Client::create([
            'user_id' => $userA->id,
            'full_name' => 'Client A',
            'email' => 'a@example.com',
            'account_status' => 'active',
        ]);

        $userB = User::factory()->create(['email' => 'b@example.com', 'role' => 'client', 'is_active' => true]);
        $clientB = Client::create([
            'user_id' => $userB->id,
            'full_name' => 'Client B',
            'email' => 'b@example.com',
            'account_status' => 'active',
        ]);

        $docA = UploadedFile::fake()->createWithContent('brief-a.pdf', "%PDF-1.4\nA\n%%EOF");
        // Client A tries to assign ownership to Client B -> rejected 403
        $this->actingAs($userA)->post('/api/media', [
            'file' => $docA,
            'visibility' => 'private',
            'category' => 'confidential_attachment',
            'owner_type' => 'client',
            'owner_id' => $clientB->id,
        ])->assertForbidden();

        // Client A uploads to own account cleanly
        $uploadRes = $this->actingAs($userA)->post('/api/media', [
            'file' => $docA,
            'visibility' => 'private',
            'category' => 'confidential_attachment',
        ])->assertCreated();

        $fileUid = $uploadRes->json('data.file_uid');
        $oldPath = MediaFile::where('file_uid', $fileUid)->value('storage_path');

        // Client B cannot download, sign, replace, or delete Client A's file
        $this->actingAs($userB)->get("/api/media/{$fileUid}/download")->assertForbidden();
        $this->actingAs($userB)->postJson("/api/media/{$fileUid}/signed-url")->assertForbidden();
        $this->actingAs($userB)->deleteJson("/api/media/{$fileUid}")->assertForbidden();

        // Client A requests short-lived signed download URL and downloads successfully
        $signedRes = $this->actingAs($userA)->postJson("/api/media/{$fileUid}/signed-url", ['ttl_minutes' => 5]);
        $signedRes->assertOk();
        $signedUrl = $signedRes->json('data.signed_url');
        $this->actingAs($userA)->get($signedUrl)->assertOk();

        // Tampered signed URL is rejected
        $this->actingAs($userA)->get($signedUrl . 'tampered')->assertForbidden();

        // Replace removes old stored object and saves new file
        $docAv2 = UploadedFile::fake()->createWithContent('brief-a-v2.pdf', "%PDF-1.4\nA-V2\n%%EOF");
        $replaceRes = $this->actingAs($userA)->post("/api/media/{$fileUid}/replace", [
            'file' => $docAv2,
        ])->assertOk();
        $newPath = MediaFile::where('file_uid', $fileUid)->value('storage_path');

        $this->assertNotSame($oldPath, $newPath);
        Storage::disk('local')->assertMissing($oldPath);
        Storage::disk('local')->assertExists($newPath);

        // Client A cannot delete an admin-issued invoice
        $invoicePdf = UploadedFile::fake()->createWithContent('inv-001.pdf', "%PDF-1.4\nINV\n%%EOF");
        $invoiceRes = $this->actingAs($admin)->post('/api/media', [
            'file' => $invoicePdf,
            'visibility' => 'private',
            'category' => 'invoice',
            'owner_type' => 'client',
            'owner_id' => $clientA->id,
        ])->assertCreated();
        $invoiceUid = $invoiceRes->json('data.file_uid');
        $this->actingAs($userA)->deleteJson("/api/media/{$invoiceUid}")->assertForbidden();

        // Owner can delete their confidential attachment and disk file is removed
        $this->actingAs($userA)->deleteJson("/api/media/{$fileUid}")->assertOk();
        Storage::disk('local')->assertMissing($newPath);
        $this->assertDatabaseMissing('media_files', ['file_uid' => $fileUid]);
    }


    public function test_client_media_listing_rejects_unknown_or_incomplete_owner_filters(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUserA = User::factory()->create(['email' => 'filter-a@example.com', 'role' => 'client', 'is_active' => true]);
        $clientA = Client::create([
            'user_id' => $clientUserA->id,
            'full_name' => 'Filter Client A',
            'email' => 'filter-a@example.com',
            'account_status' => 'active',
        ]);
        $clientUserB = User::factory()->create(['email' => 'filter-b@example.com', 'role' => 'client', 'is_active' => true]);
        $clientB = Client::create([
            'user_id' => $clientUserB->id,
            'full_name' => 'Filter Client B',
            'email' => 'filter-b@example.com',
            'account_status' => 'active',
        ]);

        foreach ([[$clientA, 'a.pdf'], [$clientB, 'b.pdf']] as [$client, $filename]) {
            $this->actingAs($admin)->post('/api/media', [
                'file' => UploadedFile::fake()->createWithContent($filename, "%PDF-1.4\\n{$filename}\\n%%EOF"),
                'visibility' => 'private',
                'category' => 'document',
                'owner_type' => 'client',
                'owner_id' => $client->id,
            ])->assertCreated();
        }

        // An unknown owner type previously skipped the client's default ownership scope.
        $this->actingAs($clientUserA)
            ->getJson('/api/media?owner_type=invoice&owner_id=' . $clientB->id)
            ->assertUnprocessable();

        // Owner filters must be supplied as a complete, valid pair.
        $this->actingAs($clientUserA)
            ->getJson('/api/media?owner_type=project')
            ->assertUnprocessable();

        $this->actingAs($clientUserA)
            ->getJson('/api/media?owner_id=' . $clientB->id)
            ->assertUnprocessable();

        // Unfiltered client listing remains restricted to the authenticated client's records.
        $response = $this->actingAs($clientUserA)->getJson('/api/media')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('a.pdf', $response->json('data.0.original_filename'));
    }

    public function test_original_filename_control_characters_are_removed_before_storage_and_response(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create(['email' => 'filename@example.com', 'role' => 'client', 'is_active' => true]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Filename Client',
            'email' => 'filename@example.com',
            'account_status' => 'active',
        ]);

        $response = $this->actingAs($admin)->post('/api/media', [
            'file' => UploadedFile::fake()->createWithContent("report\r\nX-Injected: yes.pdf", "%PDF-1.4\nreport\n%%EOF"),
            'visibility' => 'private',
            'category' => 'document',
            'owner_type' => 'client',
            'owner_id' => $client->id,
        ])->assertCreated();

        $record = MediaFile::where('file_uid', $response->json('data.file_uid'))->firstOrFail();
        $this->assertStringNotContainsString("\r", $record->original_filename);
        $this->assertStringNotContainsString("\n", $record->original_filename);
        $this->assertSame('reportX-Injected: yes.pdf', $record->original_filename);
    }



    public function test_storage_path_guard_rejects_absolute_and_traversal_paths(): void
    {
        $storage = app(PersistentStorageService::class);

        foreach ([
            '../outside.txt',
            'private/../../outside.txt',
            '/etc/passwd',
            'C:/Windows/system.ini',
            'private//duplicate-separator.txt',
        ] as $unsafePath) {
            try {
                $storage->assertSafeRelativePath($unsafePath);
                $this->fail("Unsafe path was accepted: {$unsafePath}");
            } catch (\InvalidArgumentException $exception) {
                $this->assertNotEmpty($exception->getMessage());
            }
        }

        $this->assertSame(
            'private-clients/12/document/2026/11/file.pdf',
            $storage->assertSafeRelativePath('private-clients/12/document/2026/11/file.pdf')
        );
    }

}
