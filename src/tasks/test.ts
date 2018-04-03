import { Task } from "../task-graph"
import { Module, TestSpec } from "../types/module"
import { BuildTask } from "./build"
import { TestResult } from "../types/plugin"
import { DeployTask } from "./deploy"
import { GardenContext } from "../context"
import { EntryStyle } from "../logger/types"
import chalk from "chalk"

export class TestTask<T extends Module> extends Task {
  type = "test"

  constructor(
    private ctx: GardenContext,
    private module: T, private testType: string, private testSpec: TestSpec,
    private force: boolean, private forceBuild: boolean,
  ) {
    super()
  }

  async getDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const deps: Task[] = [new BuildTask(this.ctx, this.module, this.forceBuild)]

    const services = await this.ctx.getServices(this.testSpec.dependencies)

    for (const serviceName in services) {
      const service = services[serviceName]
      deps.push(new DeployTask(this.ctx, service, false, this.forceBuild))
    }

    return deps
  }

  getKey() {
    return `${this.module.name}.${this.testType}`
  }

  async process(): Promise<TestResult> {
    // find out if module has already been tested
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      const passedEntry = this.ctx.log.info({
        section: this.module.name,
        msg: `${this.testType} tests`,
      })
      passedEntry.setSuccess({ msg: chalk.green("Already passed"), append: true })
      return testResult
    }

    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: `Running ${this.testType} tests`,
      entryStyle: EntryStyle.activity,
    })

    const result = await this.ctx.testModule(this.module, this.testSpec)

    if (result.success) {
      entry.setSuccess({ msg: chalk.green(`Success`), append: true })
    } else {
      entry.error({ msg: chalk.red(`Failed!`), append: true })
    }

    return result
  }

  async getTestResult() {
    if (this.force) {
      return null
    }

    const testResult = await this.ctx.getTestResult(this.module, await this.module.getVersion())
    return testResult && testResult.success && testResult
  }
}