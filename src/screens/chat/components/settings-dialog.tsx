import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  ComputerIcon,
  Moon01Icon,
  Sun01Icon,
} from '@hugeicons/core-free-icons'
import type { PathsPayload } from '../types'
import {
  getChatProfileDisplayName,
  useChatSettings,
} from '@/hooks/use-chat-settings'
import type { ThemeMode } from '@/hooks/use-chat-settings'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { useSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/avatars'

const PROFILE_IMAGE_MAX_DIMENSION = 128
const PROFILE_IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024
const PROFILE_IMAGE_ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]
const PROFILE_IMAGE_ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.gif,.webp'

function isAcceptedProfileImage(file: File): boolean {
  return PROFILE_IMAGE_ACCEPTED_TYPES.includes(file.type)
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise(function createImageLoader(resolve, reject) {
    const image = new Image()

    image.onload = function handleLoad() {
      resolve(image)
    }

    image.onerror = function handleError() {
      reject(new Error('Failed to load selected image'))
    }

    image.src = source
  })
}

function toAvatarSize(width: number, height: number): {
  width: number
  height: number
} {
  const largestDimension = Math.max(width, height)
  if (largestDimension <= PROFILE_IMAGE_MAX_DIMENSION) {
    return { width, height }
  }

  const scale = PROFILE_IMAGE_MAX_DIMENSION / largestDimension
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function buildAvatarDataUrl(file: File): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Image upload is not available in this environment')
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const size = toAvatarSize(image.width, image.height)

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to initialize image canvas')
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, size.width, size.height)

    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const quality = outputType === 'image/jpeg' ? 0.82 : undefined

    return canvas.toDataURL(outputType, quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

type SettingsSectionProps = {
  title: string
  children: React.ReactNode
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="border-b border-primary-200 py-4 last:border-0">
      <h3 className="mb-3 text-sm font-medium text-primary-900 text-balance">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

type SettingsRowProps = {
  label: string
  description?: string
  children: React.ReactNode
}

function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1 select-none">
        <div className="text-sm text-primary-800">{label}</div>
        {description && (
          <div className="text-xs text-primary-500 text-pretty">
            {description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathsLoading: boolean
  pathsError: string | null
  paths: PathsPayload | null
  onClose: () => void
  onCopySessionsDir: () => void
  onCopyStorePath: () => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  onClose,
}: SettingsDialogProps) {
  const { settings, updateSettings } = useChatSettings()
  const { updateSettings: updateStudioSettings } = useSettings()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileProcessing, setProfileProcessing] = useState(false)
  const profileDisplayName = getChatProfileDisplayName(settings.displayName)
  const themeOptions = [
    { value: 'system', label: 'System', icon: ComputerIcon },
    { value: 'light', label: 'Light', icon: Sun01Icon },
    { value: 'dark', label: 'Dark', icon: Moon01Icon },
  ] as const

  function applyTheme(theme: ThemeMode) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    root.classList.remove('light', 'dark', 'system')
    root.classList.add(theme)
    if (theme === 'system' && media.matches) {
      root.classList.add('dark')
    }
  }

  function handleDisplayNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    updateSettings({ displayName: event.target.value })
  }

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!isAcceptedProfileImage(file)) {
      setProfileError('Unsupported file type. Use PNG, JPG, GIF, or WebP.')
      return
    }

    if (file.size > PROFILE_IMAGE_MAX_FILE_SIZE) {
      setProfileError('Image is too large. Maximum size is 10MB.')
      return
    }

    setProfileError(null)
    setProfileProcessing(true)

    try {
      const avatarDataUrl = await buildAvatarDataUrl(file)
      updateSettings({ avatarDataUrl })
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'Failed to process image',
      )
    } finally {
      setProfileProcessing(false)
    }
  }

  function clearAvatar() {
    setProfileError(null)
    updateSettings({ avatarDataUrl: null })
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(80dvh,760px)] w-[min(480px,92vw)] max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-start justify-between border-b border-primary-200 p-4 pb-3">
            <div>
              <DialogTitle className="mb-1 text-balance">Settings</DialogTitle>
              <DialogDescription className="hidden text-pretty">
                Configure ClawSuite
              </DialogDescription>
            </div>
            <DialogClose
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-primary-500 hover:bg-primary-100 hover:text-primary-700"
                  aria-label="Close"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Button>
              }
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <SettingsSection title="Connection">
              <SettingsRow label="Status">
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <span className="size-2 rounded-full bg-green-500" />
                  Connected
                </span>
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Profile">
              <div className="flex items-center gap-3">
                <UserAvatar
                  size={48}
                  src={settings.avatarDataUrl}
                  alt={profileDisplayName}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-primary-800">
                    {profileDisplayName}
                  </p>
                  <p className="text-xs text-primary-500 text-pretty">
                    Used in the sidebar and user chat messages.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="profile-display-name"
                  className="text-xs text-primary-600"
                >
                  Display name
                </label>
                <Input
                  id="profile-display-name"
                  value={settings.displayName}
                  onChange={handleDisplayNameChange}
                  placeholder="User"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="profile-avatar-upload"
                  className="text-xs text-primary-600"
                >
                  Profile picture
                </label>
                <input
                  id="profile-avatar-upload"
                  type="file"
                  accept={PROFILE_IMAGE_ACCEPTED_EXTENSIONS}
                  onChange={handleAvatarUpload}
                  className="block w-full cursor-pointer text-xs text-primary-700 file:mr-3 file:rounded-md file:border file:border-primary-200 file:bg-primary-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-primary-800 hover:file:bg-primary-200"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearAvatar}
                    disabled={!settings.avatarDataUrl || profileProcessing}
                  >
                    Remove photo
                  </Button>
                  {profileProcessing ? (
                    <span className="text-xs text-primary-500">Processing...</span>
                  ) : null}
                </div>
                {profileError ? (
                  <p className="text-xs text-red-600 text-pretty">
                    {profileError}
                  </p>
                ) : (
                  <p className="text-xs text-primary-500 text-pretty">
                    Uploaded images are resized to a maximum of 128x128 and
                    saved locally on this device.
                  </p>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="Appearance">
              <SettingsRow label="Theme">
                <Tabs
                  value={settings.theme}
                  onValueChange={(value) => {
                    const theme = value as ThemeMode
                    applyTheme(theme)
                    updateSettings({ theme })
                    updateStudioSettings({ theme })
                  }}
                >
                  <TabsList
                    variant="default"
                    className="gap-2 *:data-[slot=tab-indicator]:duration-0"
                  >
                    {themeOptions.map((option) => (
                      <TabsTab key={option.value} value={option.value}>
                        <HugeiconsIcon
                          icon={option.icon}
                          size={20}
                          strokeWidth={1.5}
                        />
                        <span>{option.label}</span>
                      </TabsTab>
                    ))}
                  </TabsList>
                </Tabs>
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Chat">
              <SettingsRow label="Show tool messages">
                <Switch
                  checked={settings.showToolMessages}
                  onCheckedChange={(checked) =>
                    updateSettings({ showToolMessages: checked })
                  }
                />
              </SettingsRow>
              <SettingsRow label="Show reasoning blocks">
                <Switch
                  checked={settings.showReasoningBlocks}
                  onCheckedChange={(checked) =>
                    updateSettings({ showReasoningBlocks: checked })
                  }
                />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="About">
              <div className="text-sm text-primary-800 text-pretty">
                ClawSuite (beta)
              </div>
              <div className="flex gap-4 pt-2">
                <a
                  href="https://github.com/outsourc-e/clawsuite"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-600 hover:text-primary-900 hover:underline"
                >
                  GitHub
                </a>
                <a
                  href="https://docs.openclaw.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-600 hover:text-primary-900 hover:underline"
                >
                  OpenClaw docs
                </a>
              </div>
            </SettingsSection>
          </div>

          <div className="border-t border-primary-200 p-4 pt-3">
            <div className="flex justify-end">
              <DialogClose onClick={onClose}>Close</DialogClose>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
