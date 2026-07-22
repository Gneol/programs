
export const isDangerousCommand = (command: string): boolean => {
    const dangerousPatterns = [
        // Any rm command is dangerous
        /\brm\b/,                             // any rm command
        
        // Linux/macOS high-risk patterns
        /rm\s+-rf\s+\//,                     // rm -rf /
        /rm\s+-rf\s+~/,                      // rm -rf ~
        /rm\s+-rf\s+\./,                     // rm -rf .
        /rm\s+-rf\s+\/\*/,                   // rm -rf /*
        /dd\s+if=.*of=\/dev\/(sd[a-z]|hd[a-z])/, // dd to disk
        /mkfs\.\w+\s+\/dev\/(sd[a-z]|hd[a-z])/, // format disk
        /chmod\s+-R\s+0+\s+\//,              // chmod -R 000 /
        /chown\s+-R\s+.*\s+\//,              // chown -R ... /
        /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
        /kill\s+-9\s+-1/,                    // kill -9 -1
        /sudo\s+apt-get\s+remove\s+--purge\s+python3/, // remove python3
        /sudo\s+yum\s+erase\s+glibc/,        // remove glibc
        
        // Windows high-risk patterns
        /del\s+\/f\s+\/s\s+\/q\s+C:\\\*/,   // del /f /s /q C:\*
        /rmdir\s+\/s\s+\/q\s+C:\\Windows/,  // rmdir /s /q C:\Windows
        /format\s+C:\s+\/fs:\w+\s+\/q/,     // format C: /fs:... /q
        /reg\s+delete\s+HKLM\s+\/f/,        // reg delete HKLM /f
        /reg\s+delete\s+HKCU\s+\/f/,        // reg delete HKCU /f
        /netsh\s+firewall\s+set\s+opmode\s+disable/, // disable firewall
        /taskkill\s+\/f\s+\/im\s+svchost\.exe/, // kill svchost
        
        // General dangerous patterns
        /sudo\s+rm\s+-rf\s+\/usr/,          // sudo rm -rf /usr
        /sudo\s+rm\s+-rf\s+\/lib/,          // sudo rm -rf /lib
        /sudo\s+rm\s+-rf\s+\/bin/,          // sudo rm -rf /bin
        /sudo\s+rm\s+-rf\s+\/etc/,          // sudo rm -rf /etc
        /\/dev\/null/,                       // redirect to /dev/null
        /\/dev\/zero/,                       //dev/zero usage
        /\/dev\/urandom/,                    //dev/urandom usage
        /\/proc\/sys/,                       // kernel parameters
        /sysctl\s+-w/,                       // sysctl changes
        /swapoff\s+-a/,                      // disable swap
        /iptables\s+-F/,                     // flush iptables
        /ufw\s+disable/,                     // disable ufw
        
        // PowerShell dangerous patterns
        /Remove-Item\s+-Path\s+C:\\\s+-Recurse\s+-Force/, // Remove-Item C:\
        /Set-ExecutionPolicy\s+Unrestricted\s+-Force/, // unrestricted execution
        /\[System\.IO\.File\]::WriteAllText.*boot\.ini/, // overwrite boot.ini
        
        // File write patterns
        />\s*\/etc\/passwd/,                    // write to /etc/passwd
        />\s*\/etc\/shadow/,                    // write to /etc/shadow
        />\s*\/etc\/sudoers/,                   // write to sudoers file
        />\s*\/etc\/hosts/,                     // write to hosts file
        />\s*\/etc\/crontab/,                   // write to system crontab
        />\s*\/etc\/fstab/,                     // write to fstab
        />\s*\/boot\/grub\/grub.cfg/,          // write to grub config
        />\s*\/etc\/profile/,                   // write to system profile
        />\s*\/etc\/bash.bashrc/,              // write to system bashrc
        /echo\s+.*\s+>\s*\/etc\//,             // echo to any /etc file
        /cat\s+>\s*\/etc\//,                    // cat to any /etc file
        /tee\s+\/etc\//,                        // tee to /etc directory
        
        // Windows file write patterns
        />\s*C:\\Windows\\System32\\drivers\\etc\\hosts/,  // write to hosts file
        />\s*C:\\Windows\\System32\\config\\SAM/,        // write to SAM database
        />\s*C:\\Windows\\System32\\config\\SYSTEM/,     // write to SYSTEM hive
        />\s*C:\\boot.ini/,                              // write to boot.ini
        /echo\s+.*\s+>\s*C:\\Windows\\/,                 // echo to Windows directory
        /type\s+.*\s+>\s*C:\\Windows\\/,                // type to Windows directory
        
        // Critical system files
        />\s*\/proc\/sysrq-trigger/,            // write to sysrq trigger
        />\s*\/sys\/class\/backlight\//,        // write to backlight controls
        />\s*\/sys\/devices\/system\/cpu\//,   // write to CPU controls
        
        // Shell configuration files
        />\s*~\/\.bashrc/,                      // write to user bashrc
        />\s*~\/\.bash_profile/,                // write to bash profile
        />\s*~\/\.zshrc/,                       // write to zshrc
        />\s*~\/\.profile/,                     // write to profile
        
        // SSH configuration
        />\s*~\/\.ssh\/authorized_keys/,       // write to authorized_keys
        />\s*~\/\.ssh\/config/,                // write to ssh config
        />\s*\/etc\/ssh\/sshd_config/,         // write to sshd config
        
        // Systemd service files
        />\s*\/etc\/systemd\/system\//,        // write to systemd services
        />\s*\/lib\/systemd\/system\//,        // write to systemd lib services
        
        // Cron jobs
        />\s*\/var\/spool\/cron\//,            // write to cron spool
        />\s*\/etc\/cron\.d\//,                // write to cron.d
        
        // Log manipulation
        />\s*\/var\/log\//,                    // write to log files
        /truncate\s+-s\s+0\s+\/var\/log\//,    // truncate log files
        
        // Package manager sources
        />\s*\/etc\/apt\/sources.list/,        // write to apt sources
        />\s*\/etc\/yum.repos.d\//,            // write to yum repos
        
        // Network configuration
        />\s*\/etc\/network\/interfaces/,      // write to network interfaces
        />\s*\/etc\/resolv.conf/,              // write to DNS resolvers
        />\s*\/etc\/netplan\//,                // write to netplan config
        
        // Kernel modules
        />\s*\/etc\/modules-load.d\//,         // write to kernel modules
        />\s*\/etc\/modprobe.d\//,             // write to modprobe config
    ];
    
    const normalizedCommand = command.trim().toLowerCase();
    
    // Check against dangerous patterns
    for (const pattern of dangerousPatterns) {
        if (pattern.test(normalizedCommand)) {
            return true;
        }
    }

    if(normalizedCommand.includes('rm')){
        return true;
    }

    if(normalizedCommand.includes('delete')){
        return true;
    }

    if(normalizedCommand.includes('kill')){
        return true;
    }
    
    // Additional heuristic checks
    if (normalizedCommand.includes('rm -rf') && 
        (normalizedCommand.includes('/') || normalizedCommand.includes('~'))) {
        return true;
    }
    
    if (normalizedCommand.includes('format') && normalizedCommand.includes('c:')) {
        return true;
    }
    
    if (normalizedCommand.includes('reg delete') && 
        (normalizedCommand.includes('hklm') || normalizedCommand.includes('hkcu'))) {
        return true;
    }
    
    // File write heuristic checks
    if ((normalizedCommand.includes('>') || normalizedCommand.includes('>>')) && 
        (normalizedCommand.includes('/etc/') || 
         normalizedCommand.includes('c:\\windows\\system32') ||
         normalizedCommand.includes('/proc/') ||
         normalizedCommand.includes('/sys/'))) {
        return true;
    }
    
    return false;
}

