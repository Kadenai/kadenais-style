#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$WorkspaceRoot,
    [switch]$PrepareOnly,
    [switch]$Terminal
)
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $documentsPath = [Environment]::GetFolderPath('MyDocuments')
    if ([string]::IsNullOrWhiteSpace($documentsPath)) { throw 'A pasta Documentos não foi encontrada.' }
    $WorkspaceRoot = Join-Path $documentsPath 'Claude\Kadenai Chats'
}
$resolvedRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
$chatName = (Get-Date -Format 'yyyy-MM-dd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$chatPath = [IO.Path]::GetFullPath((Join-Path $resolvedRoot $chatName))
if (-not $chatPath.StartsWith($resolvedRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'A pasta da conversa precisa estar dentro da pasta de chats.'
}
New-Item -ItemType Directory -Path $chatPath -Force | Out-Null
$instructions = @'
# Conversa sem projeto — Kadenai's Style

Esta pasta é o espaço de trabalho desta conversa, sem vínculo com um projeto Git.
Responda no chat quando isso for suficiente. Salve arquivos finais em outputs/ e
arquivos temporários em work/. Não inicialize Git a menos que o usuário peça.
'@
[IO.File]::WriteAllText((Join-Path $chatPath 'CLAUDE.md'), $instructions, [Text.UTF8Encoding]::new($false))
New-Item -ItemType Directory -Path (Join-Path $chatPath 'outputs'), (Join-Path $chatPath 'work') -Force | Out-Null

if ($PrepareOnly) {
    @{ path = $chatPath } | ConvertTo-Json -Compress
    exit 0
}

$claudeCommand = Get-Command claude -ErrorAction Stop
Push-Location -LiteralPath $chatPath
try {
    if ($Terminal) { & $claudeCommand.Source }
    else { & $claudeCommand.Source --desktop }
    if ($LASTEXITCODE -ne 0) { throw "Claude retornou erro. A pasta foi preservada em: $chatPath" }
} finally { Pop-Location }
