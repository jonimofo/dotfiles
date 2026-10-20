# Runbook 04 — VirtualBox refuses to start: VERR_VMX_IN_VMX_ROOT_MODE — Dell XPS 13 9315, Debian 13

Audience: an AI assistant (Claude Code) working on this machine in a future session. Written 2026-09-15.

## 0. Symptom

Starting any VirtualBox VM (seen with "CachyOs-Niri") fails with:
```
VT-x is being used by another hypervisor (VERR_VMX_IN_VMX_ROOT_MODE).
VirtualBox can't operate in VMX root mode. Please disable the KVM kernel extension...
Result Code: NS_ERROR_FAILURE (0x80004005)  Component: ConsoleWrap
```

## 1. Cause

The in-kernel `kvm_intel` module owns the CPU's VT-x. VirtualBox 7.2 (package `virtualbox-7.2`, modules `vboxdrv vboxnetflt vboxnetadp`) needs VT-x for itself and cannot share it with KVM.
`kvm_intel` auto-loads at every boot because the CPU supports VT-x, even though nothing uses it here: `libvirtd`/`virtqemud` are inactive, no `qemu-system` process, `lsmod` shows `kvm_intel` with 0 users.
It came back after the 2026-09-15 10:24 reboot even though it had been unloaded by hand that morning.

## 2. Fix

Immediate (no reboot, nothing on disk; done by the user on 2026-09-15):
```
sudo modprobe -r kvm_intel kvm
```
Then start the VM.

Permanent (survives reboots; only if QEMU/KVM acceleration is not needed — `qemu-system-x86` is installed, so ask before applying):
```
printf 'blacklist kvm_intel\nblacklist kvm\n' | sudo tee /etc/modprobe.d/blacklist-kvm.conf
```
Reverse: delete that file and `sudo modprobe kvm_intel`.

## 3. Diagnose in 10 seconds

```
lsmod | grep -E '^kvm'                       # loaded? then VirtualBox cannot start
systemctl is-active libvirtd virtqemud       # both inactive = safe to unload
pgrep qemu-system || echo "no qemu running"  # safe to unload
sudo modprobe -r kvm_intel kvm
```
If `modprobe -r` says "Module kvm_intel is in use": a QEMU/libvirt VM is running; stop it first, never force.

## 4. Do not

- Do not follow the error text literally ("recompile your kernel"): a module unload or blacklist is all that is needed.
- Do not uninstall `qemu-system-x86`/libvirt on the assumption they are unused; the user is in the `libvirt` group.
- Do not unload `vboxdrv` to "free" VT-x for KVM unless the user asks the reverse question (KVM VM failing with VirtualBox running).

## 5. Status on 2026-09-15

Both fixes applied by the user: `kvm_intel`/`kvm` unloaded, and `/etc/modprobe.d/blacklist-kvm.conf` created (blacklist kvm_intel + kvm). KVM stays off across reboots; QEMU would run without acceleration. To get KVM back: delete the file, `sudo modprobe kvm_intel` (VirtualBox then stops working again).
