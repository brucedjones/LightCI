# LightCI
Serverless CI with GitHub.

When running, LightCI will watch your GitHub repos for changes on the master branch. For a repo to be considered it must have build script 'light.sh' in the root directory. This script must return 0 for a succesful build, or 1 for a failed build.

When a new commit is detected on the master branch, LightCI will clone the repo, execute the build script, and record on GitHub if the build passed or failed. Success or failure is recorded in the commit history on GitHub. When a build fails, output from stdout and stderr are recorded in a new issue. When a subsequent build succeeds, prior failed build issues are closed.

The LightCI process is similar to GitlabCI's worker process, however currently only one LightCI process should be used at any time. Multiple LightCI processes will result in repeated builds and/or race conditions.

# Usage

## Install
```npm install -g lightci ```

## light.json
```
{
    "authentication": {
        "type": "oauth",
        "token": "<personal oauth token>"
      },
    "owner":"someOrganization",
    "repos":["owner/repo","owner2/repo2",...],
    "ignore":["owner3/repo3",...],
    "frequency":600000
    "name":"worker1"
}
```

| Field          | Type   | Description                                         |
|----------------|--------|-----------------------------------------------------|
| authentication | object        | Github authentication object as described [here](https://www.npmjs.com/package/github#authentication) |
| owner `optional`         | string        | The username, team, or organization that owns the repositories to be tested |
| repos `optional`         | string array  | A list of fully qualified repo names to explicitly check |
| ignore `optional`         | string array  | A list of fully qualified repo names to explicitly ignore |
| frequency `optional`      | integer | The frequency with which to poll github in ms (default: 600,000ms)                           |
| name `optional`          | string | The name of this LightCI process |

An owner or list of repos must be specified, all other optional fields are not required.

## light.<i></i>sh

A Repository is only considered for testing if it includes a script named ```light.sh```.

```light.sh``` is a bash script that is responsible for building and testing your code. This script is expected to return 0 for success, or 1 for failure. A Hello World of failing build tests:

```bash
#! /bin/bash
echo Hello World
return 1
```

A repository may specify a named LightCI process to handle it's build testing. This is done by specifying the name of the LightCI process in the build script filename. For example, a repository with build script named `light.someWorker.sh` will only be processed by a LightCI process with name set to `someWorker` in it's `light.json` configuration file. 

## Execution
Execute the following from a directory containing a light.json configuration file. 

```bash
$ lightci
```

or with a configuration file in a different directory:

```bash
$ lightci -c '/path/to/light.json'
```

or logging to file:

```bash
$ lightci > lightci.log &
```

or as a service (requires [pm2](https://www.npmjs.com/package/pm2))

```bash
$ pm2 start lightci -e err.log -o out.log -x -- -c '/path/to/light.json'
```

## Named processes
If a LightCI process is named it will *only* process repositories that contain a build script where the file name corresponds to the processes name as specified in `light.json`. For example, a repository with build script named `light.someWorker.sh` will only be processed by a LightCI process with name set to `someWorker` in it's `light.json` configuration file.

# Troubleshooting
### Build fails with no output
Most likely due to the fact that github.com is not listed in the ssh known_hosts. You can overcome this by simply running 
```bash
$ ssh git@github.com
```
When prompted respond with yes. The connection will fail but github.com will be added to known_hosts. Restart LightCI.