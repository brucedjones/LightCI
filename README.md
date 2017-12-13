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
    "owner":"<Username, team or organization>",
    "repos":["owner/repo","owner2/repo2",...],
    "ignore":["owner3/repo3"],
    "frequency":<Frequency with which to check for changes (ms)>
}
```
The configuration file may specify an owner, to watch all repo's owned by this user, team or organization. Alternatively/additionally, a list of fully qualified repo names may be specified.

Repo's are ignored completely if their fully qualified name appears in the ignore list. 

## light.<i></i>sh

A Repository is only considered for testing if it includes a script named ```light.sh```.

```light.sh``` is a bash script that is responsible for building and testing your code. This script is expected to return 0 for success, or 1 for failure. A Hello World of failing build tests:

```bash
#! /bin/bash
echo Hello World
return 1
```

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