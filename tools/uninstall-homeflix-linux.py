#!/usr/bin/env python3
"""HomeFlix Cyber Node Linux uninstaller GUI."""
import os
import shutil
import subprocess
import tkinter as tk
from tkinter import messagebox

APP_TITLE = "HomeFlix Cyber Node Uninstaller"
PACKAGE_NAME = "homeflix-cyber-node"


def package_installed():
    try:
        result = subprocess.run(
            ["dpkg-query", "-W", "-f=${Status}", PACKAGE_NAME],
            capture_output=True, text=True, check=False,
        )
        return "install ok installed" in result.stdout
    except FileNotFoundError:
        return False


def remove_package():
    if not package_installed():
        messagebox.showinfo("Not installed", "The HomeFlix Debian package was not detected.\n\nYou can still remove desktop shortcuts or settings below.")
        return True
    if not messagebox.askyesno(
        "Confirm uninstall",
        "Remove the installed HomeFlix Cyber Node application?\n\n"
        "Your personal settings and media files will not be removed.",
    ):
        return False

    pkexec = shutil.which("pkexec")
    if not pkexec:
        messagebox.showerror(
            "Administrator permission required",
            "This system does not have pkexec available.\n\n"
            "Open a terminal and run:\n\nsudo apt-get remove homeflix-cyber-node",
        )
        return False

    try:
        result = subprocess.run(
            [pkexec, "apt-get", "remove", "-y", PACKAGE_NAME],
            check=False,
        )
    except OSError as exc:
        messagebox.showerror("Uninstall failed", str(exc))
        return False

    if result.returncode != 0:
        messagebox.showerror(
            "Uninstall did not finish",
            "The package manager did not complete the removal. "
            "Approve the administrator prompt and try again.",
        )
        return False
    messagebox.showinfo("Application removed", "HomeFlix Cyber Node was removed successfully.")
    return True


def remove_user_shortcuts():
    data_home = os.environ.get("XDG_DATA_HOME", os.path.join(os.path.expanduser("~"), ".local", "share"))
    app_dirs = {os.path.join(data_home, "applications")}
    removed = []
    for folder in app_dirs:
        if not os.path.isdir(folder):
            continue
        for filename in os.listdir(folder):
            lower = filename.lower()
            if filename.endswith(".desktop") and ("homeflix" in lower or "cyber-node" in lower):
                path = os.path.join(folder, filename)
                try:
                    os.remove(path)
                    removed.append(path)
                except OSError:
                    pass
    return removed


def remove_settings():
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".config", "HomeFlix Cyber Node"),
        os.path.join(home, ".config", "homeflix-cyber-node"),
        os.path.join(home, ".cache", "homeflix-cyber-node"),
    ]
    removed = []
    for path in candidates:
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
            if not os.path.exists(path):
                removed.append(path)
        elif os.path.isfile(path):
            try:
                os.remove(path)
                removed.append(path)
            except OSError:
                pass
    return removed


def uninstall():
    if not remove_package():
        return
    shortcuts = remove_user_shortcuts()
    keep_data = messagebox.askyesno(
        "Keep personal settings?",
        "Do you want to KEEP your HomeFlix settings and cache?\n\n"
        "Choose Yes to keep them (recommended), or No to delete them.",
    )
    removed_data = [] if keep_data else remove_settings()
    lines = ["The uninstaller has finished."]
    lines.append("User desktop shortcuts removed: " + str(len(shortcuts)))
    lines.append("Personal settings/cache: " + ("kept" if keep_data else f"removed ({len(removed_data)} locations)"))
    lines.append("\nPortable AppImage downloads are not deleted automatically.")
    messagebox.showinfo("Finished", "\n".join(lines))


def main():
    root = tk.Tk()
    root.title(APP_TITLE)
    root.geometry("480x300")
    root.minsize(440, 280)
    root.configure(bg="#111111")

    title = tk.Label(
        root, text="HOMEFLIX", font=("TkDefaultFont", 22, "bold"),
        fg="#ff3038", bg="#111111",
    )
    title.pack(pady=(24, 2))
    subtitle = tk.Label(
        root, text="CYBER NODE • LINUX UNINSTALLER",
        font=("TkDefaultFont", 10, "bold"), fg="#eeeeee", bg="#111111",
    )
    subtitle.pack(pady=(0, 14))
    description = tk.Label(
        root,
        text="Remove the installed app, clean up your user shortcut,\nand choose whether to keep your personal settings.",
        font=("TkDefaultFont", 10), fg="#cccccc", bg="#111111", justify="center",
    )
    description.pack(pady=8)

    button = tk.Button(
        root, text="UNINSTALL HOMEFLIX", command=uninstall,
        font=("TkDefaultFont", 11, "bold"), fg="white", bg="#c91824",
        activebackground="#ed2935", activeforeground="white",
        relief="flat", padx=20, pady=10, cursor="hand2",
    )
    button.pack(pady=18)
    tk.Label(
        root, text="Your media files are not deleted by this tool.",
        font=("TkDefaultFont", 9), fg="#999999", bg="#111111",
    ).pack(pady=(0, 12))
    root.mainloop()


if __name__ == "__main__":
    main()
