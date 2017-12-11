# LightCI
Serverless CI with GitHub.

When running, LightCI will watch your GitHub repos for changes on the master branch. For a repo to be considered it must have build script 'light.sh' in the root directory. This script must return 0 for a succesful build, or 1 for a failed build.

When a new commit is detected on the master branch, LightCI will clone the repo, execute the build script, and record on GitHub if the build passed or failed. Success or failure is recorded in the commit history on GitHub. When a build fails, output from stdout and stderr are recorded in a new issue. When a subsequent build succeeds, prior failed build issues are closed.

The LightCI process is similar to GitlabCI's worker process, however currently only one LightCI process should be used at any time. Multiple LightCI processes will result in repeated builds and/or race conditions.

# Usage

## Install
```npm install -g lightci ```

## light.json
```json
{
    "authentication": {
        "type": "oauth",
        "token": "<personal oauth token>"
      },
    "owner":"<Username, team or organization>",
    "frequency":<Frequency with which to check for changes (ms)>
}
```

## Execution
Execute the following from a directory containing a light.json configuration file. 

```bash
$ lightci
```
or logging to file:

```bash
$ lightci > lightci.log
```