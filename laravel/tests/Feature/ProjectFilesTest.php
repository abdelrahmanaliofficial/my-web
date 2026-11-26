<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProjectFilesTest extends TestCase
{
    use RefreshDatabase;

    public function test_two_clients_cannot_access_or_download_each_others_project_files(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);

        $clientUserA = User::factory()->create(['email' => 'alpha@example.com', 'role' => 'client', 'is_active' => true]);
        $clientA = Client::create([
            'user_id' => $clientUserA->id,
            'full_name' => 'Client Alpha',
            'email' => 'alpha@example.com',
            'account_status' => 'active',
        ]);

        $clientUserB = User::factory()->create(['email' => 'beta@example.com', 'role' => 'client', 'is_active' => true]);
        $clientB = Client::create([
            'user_id' => $clientUserB->id,
            'full_name' => 'Client Beta',
            'email' => 'beta@example.com',
            'account_status' => 'active',
        ]);

        $projectA = Project::create([
            'client_id' => $clientA->id,
            'name' => 'Alpha Launch',
            'service_category' => 'Web Engineering',
            'status' => 'in_progress',
        ]);

        $projectB = Project::create([
            'client_id' => $clientB->id,
            'name' => 'Beta Growth',
            'service_category' => 'SEO',
            'status' => 'planning',
        ]);

        // Admin uploads contract to Project A even if malicious client_id is passed in body
        $pdfA = UploadedFile::fake()->createWithContent('alpha-contract.pdf', "%PDF-1.4\nAlphaContract\n%%EOF");
        $uploadA = $this->actingAs($admin)->post("/api/projects/{$projectA->id}/files", [
            'file' => $pdfA,
            'category' => 'contract',
            'client_id' => $clientB->id, // Must be ignored by backend
        ])->assertCreated();

        $fileUidA = $uploadA->json('data.file_uid');
        $storedA = MediaFile::where('file_uid', $fileUidA)->firstOrFail();
        $this->assertSame($clientA->id, $storedA->client_id);
        $this->assertSame($admin->id, $storedA->uploaded_by);
        $this->assertSame('alpha-contract.pdf', $uploadA->json('data.original_filename'));
        $this->assertArrayNotHasKey('storage_path', $uploadA->json('data'));
        $this->assertArrayNotHasKey('client_id', $uploadA->json('data'));
        $this->assertSame('contract', $uploadA->json('data.category'));

        // Admin uploads deliverable to Project B
        $pdfB = UploadedFile::fake()->createWithContent('beta-deliverable.pdf', "%PDF-1.4\nBetaDeliverable\n%%EOF");
        $uploadB = $this->actingAs($admin)->post("/api/projects/{$projectB->id}/files", [
            'file' => $pdfB,
            'category' => 'deliverable',
        ])->assertCreated();
        $fileUidB = $uploadB->json('data.file_uid');

        // Client A can list and download Project A files, and cannot access Project B
        $this->actingAs($clientUserA)
            ->getJson("/api/client/projects/{$projectA->id}/files?client_id={$clientB->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.file_uid', $fileUidA);

        $this->actingAs($clientUserA)->get("/api/media/{$fileUidA}/download")->assertOk();
        $signedA = $this->actingAs($clientUserA)
            ->postJson("/api/media/{$fileUidA}/signed-url")
            ->assertOk()
            ->json('data.signed_url');
        $this->actingAs($clientUserA)->get($signedA)->assertOk();

        // Client A cannot list or download Client B's files
        $this->actingAs($clientUserA)->getJson("/api/client/projects/{$projectB->id}/files")->assertForbidden();
        $this->actingAs($clientUserA)->get("/api/media/{$fileUidB}/download")->assertForbidden();
        $this->actingAs($clientUserA)->postJson("/api/media/{$fileUidB}/signed-url")->assertForbidden();

        // Client B cannot list, download, or replay Client A's signed URL
        $this->actingAs($clientUserB)->getJson("/api/client/projects/{$projectA->id}/files")->assertForbidden();
        $this->actingAs($clientUserB)->get("/api/media/{$fileUidA}/download")->assertForbidden();
        $this->actingAs($clientUserB)->get($signedA)->assertForbidden();

        // Neither client can upload, replace, or delete project files
        $this->actingAs($clientUserA)->postJson("/api/projects/{$projectA->id}/files", [
            'file' => UploadedFile::fake()->createWithContent('hack.pdf', "%PDF-1.4\nH\n%%EOF"),
            'category' => 'document',
        ])->assertForbidden();
        $this->actingAs($clientUserA)->postJson("/api/projects/{$projectA->id}/files/{$fileUidA}/replace", [
            'file' => UploadedFile::fake()->createWithContent('hack.pdf', "%PDF-1.4\nH\n%%EOF"),
        ])->assertForbidden();
        $this->actingAs($clientUserA)->deleteJson("/api/projects/{$projectA->id}/files/{$fileUidA}")->assertForbidden();
    }

    public function test_project_file_lists_expose_only_private_files_and_validate_supported_categories(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create([
            'email' => 'project-files-owner@example.com',
            'role' => 'client',
            'is_active' => true,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Project Files Owner',
            'email' => 'project-files-owner@example.com',
            'account_status' => 'active',
        ]);
        $project = Project::create([
            'client_id' => $client->id,
            'name' => 'Private Deliverables',
            'service_category' => 'Digital Marketing',
            'status' => 'in_progress',
        ]);

        foreach (MediaFile::PROJECT_CATEGORIES as $category) {
            $file = UploadedFile::fake()->createWithContent(
                $category . '.pdf',
                "%PDF-1.4\n" . $category . "\n%%EOF"
            );

            $response = $this->actingAs($admin)->post("/api/projects/{$project->id}/files", [
                'file' => $file,
                'category' => $category,
            ])->assertCreated();

            $response->assertJsonPath('data.category', $category);
            $response->assertJsonPath('data.original_filename', $category . '.pdf');
            $response->assertJsonPath('data.file_size', $file->getSize());
            $response->assertJsonPath('data.uploader.id', $admin->id);
            $this->assertArrayNotHasKey('storage_path', $response->json('data'));
        }

        // Legacy or malformed public records must never appear in a project's private file area.
        $publicPath = 'public-assets/legacy/project-public-file.pdf';
        Storage::disk('public')->put($publicPath, "%PDF-1.4\npublic\n%%EOF");
        $publicProjectFile = MediaFile::create([
            'file_uid' => (string) \Illuminate\Support\Str::uuid(),
            'visibility' => 'public',
            'category' => 'document',
            'original_filename' => 'project-public-file.pdf',
            'stored_filename' => 'project-public-file.pdf',
            'disk' => 'public',
            'storage_path' => $publicPath,
            'mime_type' => 'application/pdf',
            'extension' => 'pdf',
            'file_size' => Storage::disk('public')->size($publicPath),
            'owner_type' => Project::class,
            'owner_id' => $project->id,
            'client_id' => $client->id,
            'uploaded_by' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->getJson("/api/projects/{$project->id}/files")
            ->assertOk()
            ->assertJsonCount(count(MediaFile::PROJECT_CATEGORIES), 'data');

        $this->actingAs($clientUser)
            ->getJson("/api/client/projects/{$project->id}/files")
            ->assertOk()
            ->assertJsonCount(count(MediaFile::PROJECT_CATEGORIES), 'data');

        // Public media must not be replaceable or deletable through private project-file routes.
        $this->actingAs($admin)->post("/api/projects/{$project->id}/files/{$publicProjectFile->file_uid}/replace", [
            'file' => UploadedFile::fake()->createWithContent('replacement.pdf', "%PDF-1.4\nreplacement\n%%EOF"),
        ])->assertNotFound();
        $this->actingAs($admin)->deleteJson("/api/projects/{$project->id}/files/{$publicProjectFile->file_uid}")
            ->assertNotFound();

        $this->actingAs($admin)
            ->getJson("/api/projects/{$project->id}/files?category=contract")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.category', 'contract');

        $this->actingAs($clientUser)
            ->getJson("/api/client/projects/{$project->id}/files?category=contract")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.category', 'contract');

        $this->actingAs($admin)
            ->getJson("/api/projects/{$project->id}/files?category=unknown")
            ->assertUnprocessable();

        $this->actingAs($clientUser)
            ->getJson("/api/client/projects/{$project->id}/files?category=unknown")
            ->assertUnprocessable();
    }

    public function test_admin_permissions_control_upload_replace_and_delete_for_project_files(): void
    {
        Storage::fake('local');

        $superAdmin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $viewAdmin = User::factory()->withPermissions(['view_projects'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $updateAdmin = User::factory()->withPermissions(['view_projects', 'update_projects'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);

        $clientUser = User::factory()->create(['email' => 'c@example.com', 'role' => 'client', 'is_active' => true]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Client Co',
            'email' => 'c@example.com',
            'account_status' => 'active',
        ]);
        $project = Project::create([
            'client_id' => $client->id,
            'name' => 'Design Retainer',
            'service_category' => 'Design',
            'status' => 'in_progress',
        ]);

        // View-only admin cannot upload
        $designV1 = UploadedFile::fake()->image('wireframe-v1.png', 400, 300);
        $this->actingAs($viewAdmin)->post("/api/projects/{$project->id}/files", [
            'file' => $designV1,
            'category' => 'design',
        ])->assertForbidden();

        // Update admin can upload & replace, but cannot delete
        $res = $this->actingAs($updateAdmin)->post("/api/projects/{$project->id}/files", [
            'file' => $designV1,
            'category' => 'design',
        ])->assertCreated();
        $fileUid = $res->json('data.file_uid');
        $oldPath = MediaFile::where('file_uid', $fileUid)->value('storage_path');

        $designV2 = UploadedFile::fake()->image('wireframe-v2.png', 500, 350);
        $replaceRes = $this->actingAs($updateAdmin)->post("/api/projects/{$project->id}/files/{$fileUid}/replace", [
            'file' => $designV2,
            'category' => 'deliverable',
        ])->assertOk();
        $newPath = MediaFile::where('file_uid', $fileUid)->value('storage_path');

        $this->assertSame('deliverable', $replaceRes->json('data.category'));
        $this->assertArrayNotHasKey('storage_path', $replaceRes->json('data'));
        Storage::disk('local')->assertMissing($oldPath);
        Storage::disk('local')->assertExists($newPath);

        $this->actingAs($updateAdmin)->deleteJson("/api/projects/{$project->id}/files/{$fileUid}")->assertForbidden();

        // Super admin can delete cleanly
        $this->actingAs($superAdmin)->deleteJson("/api/projects/{$project->id}/files/{$fileUid}")->assertOk();
        Storage::disk('local')->assertMissing($newPath);
        $this->assertDatabaseMissing('media_files', ['file_uid' => $fileUid]);
    }
}
